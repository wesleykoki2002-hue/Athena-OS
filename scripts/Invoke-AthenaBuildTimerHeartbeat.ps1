[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$BaseUrl =
        "http://localhost:3000",

    [Parameter(Mandatory = $false)]
    [string]$Token,

    [Parameter(Mandatory = $false)]
    [ValidateRange(30, 300)]
    [int]$IntervalSeconds =
        60,

    [Parameter(Mandatory = $false)]
    [switch]$Once
)

$ErrorActionPreference = "Stop"

function ConvertFrom-AthenaSecureString {
    param(
        [Parameter(Mandatory = $true)]
        [Security.SecureString]$SecureValue
    )

    $Pointer =
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            $SecureValue
        )

    try {
        return (
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
                $Pointer
            )
        )
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
            $Pointer
        )
    }
}

function Read-AthenaHelperToken {
    param(
        [Parameter(Mandatory = $false)]
        [string]$SubmittedToken
    )

    $ResolvedToken =
        $SubmittedToken

    if ([string]::IsNullOrWhiteSpace($ResolvedToken)) {
        $ResolvedToken =
            [Environment]::GetEnvironmentVariable(
                "ATHENA_BUILD_TIMER_HELPER_TOKEN",
                "Process"
            )
    }

    if ([string]::IsNullOrWhiteSpace($ResolvedToken)) {
        $SecureToken =
            Read-Host `
                "Enter the short-lived Athena helper token" `
                -AsSecureString

        $ResolvedToken =
            ConvertFrom-AthenaSecureString `
                -SecureValue $SecureToken

        $SecureToken.Dispose()
    }

    $ResolvedToken =
        $ResolvedToken.Trim()

    if (
        $ResolvedToken -notmatch
        "^[A-Za-z0-9_-]{40,200}$"
    ) {
        throw (
            "The helper token format is invalid."
        )
    }

    return $ResolvedToken
}

function Resolve-AthenaHeartbeatUri {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SubmittedBaseUrl
    )

    $ParsedUri = $null

    if (-not [Uri]::TryCreate(
        $SubmittedBaseUrl.Trim(),
        [UriKind]::Absolute,
        [ref]$ParsedUri
    )) {
        throw (
            "BaseUrl must be an absolute URL."
        )
    }

    $IsSecure =
        $ParsedUri.Scheme -eq "https"

    $IsLocalHttp = (
        $ParsedUri.Scheme -eq "http" -and
        (
            $ParsedUri.Host -eq "localhost" -or
            $ParsedUri.Host -eq "127.0.0.1" -or
            $ParsedUri.Host -eq "::1"
        )
    )

    if (
        -not $IsSecure -and
        -not $IsLocalHttp
    ) {
        throw (
            "Non-local helper endpoints must use HTTPS."
        )
    }

    $NormalizedBaseUrl =
        $SubmittedBaseUrl.Trim().TrimEnd("/")

    return (
        $NormalizedBaseUrl +
        "/api/build-timer/helper-heartbeat"
    )
}

$ResolvedToken = $null
$HeartbeatUri = $null
$HttpClient = $null

try {
    $ResolvedToken =
        Read-AthenaHelperToken `
            -SubmittedToken $Token

    $HeartbeatUri =
        Resolve-AthenaHeartbeatUri `
            -SubmittedBaseUrl $BaseUrl

    $HttpClient =
        New-Object `
            System.Net.Http.HttpClient

    $HttpClient.Timeout =
        [TimeSpan]::FromSeconds(
            20
        )

    $HttpClient.DefaultRequestHeaders.TryAddWithoutValidation(
        "Authorization",
        (
            "Bearer " +
            $ResolvedToken
        )
    ) |
    Out-Null

    $HttpClient.DefaultRequestHeaders.TryAddWithoutValidation(
        "Accept",
        "application/json"
    ) |
    Out-Null

    Write-Host (
        "Athena timer helper endpoint: " +
        $HeartbeatUri
    )

    Write-Host (
        "Heartbeat interval: " +
        $IntervalSeconds +
        " seconds"
    )

    Write-Host "Token displayed: NO"
    Write-Host "Token written to disk: NO"
    Write-Host "Offline replay enabled: NO"

    do {
        $OperationKey =
            "powershell-heartbeat:" +
            [Guid]::NewGuid().ToString()

        $Payload = @{
            operation_key =
                $OperationKey

            evidence = @{
                helper_version =
                    "0083-v1"

                host_name =
                    [Environment]::MachineName

                process_id =
                    $PID

                emitted_at =
                    [DateTimeOffset]::UtcNow.ToString(
                        "o"
                    )

                offline_replay =
                    $false
            }
        } |
        ConvertTo-Json `
            -Depth 8 `
            -Compress

        $Request =
            New-Object `
                System.Net.Http.HttpRequestMessage(
                    [System.Net.Http.HttpMethod]::Post,
                    $HeartbeatUri
                )

        $Request.Content =
            New-Object `
                System.Net.Http.StringContent(
                    $Payload,
                    [Text.Encoding]::UTF8,
                    "application/json"
                )

        $Response = $null

        try {
            $Response =
                $HttpClient.SendAsync(
                    $Request
                ).GetAwaiter().GetResult()

            $ResponseBody =
                $Response.Content.ReadAsStringAsync(
                ).GetAwaiter().GetResult()

            if (-not $Response.IsSuccessStatusCode) {
                $SafeError =
                    "Heartbeat failed with HTTP status " +
                    [int]$Response.StatusCode +
                    "."

                try {
                    $ParsedError =
                        $ResponseBody |
                        ConvertFrom-Json `
                            -ErrorAction Stop

                    if (
                        $ParsedError.error -and
                        $ParsedError.error -is [string]
                    ) {
                        $SafeError +=
                            " " +
                            $ParsedError.error
                    }
                }
                catch {
                }

                throw $SafeError
            }

            $ParsedResponse =
                $ResponseBody |
                ConvertFrom-Json `
                    -ErrorAction Stop

            if (
                $ParsedResponse.ok -ne $true -or
                $null -eq $ParsedResponse.data
            ) {
                throw (
                    "Heartbeat endpoint returned an invalid success response."
                )
            }

            $TimerStatus =
                [string]$ParsedResponse.data.status

            $ActiveSeconds =
                [string]$ParsedResponse.data.active_seconds

            Write-Host (
                [DateTimeOffset]::Now.ToString(
                    "yyyy-MM-dd HH:mm:ss zzz"
                ) +
                " | Heartbeat recorded" +
                " | Status: " +
                $TimerStatus +
                " | Active seconds: " +
                $ActiveSeconds
            )
        }
        catch {
            throw (
                "Heartbeat was not queued or replayed. " +
                $_.Exception.Message
            )
        }
        finally {
            if ($Response) {
                $Response.Dispose()
            }

            $Request.Dispose()

            $Payload = $null
            $ResponseBody = $null
            $OperationKey = $null
        }

        if (-not $Once) {
            Start-Sleep `
                -Seconds $IntervalSeconds
        }
    }
    while (-not $Once)
}
finally {
    if ($HttpClient) {
        $HttpClient.Dispose()
    }

    $ResolvedToken = $null
    $Token = $null
    $HeartbeatUri = $null
}