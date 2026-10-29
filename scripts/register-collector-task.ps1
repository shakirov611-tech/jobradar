param(
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [ValidateSet('Install','Remove','Status')][string]$Mode='Install'
)
$ErrorActionPreference='Stop'
$taskName='JobRadar Collector'
if($Mode -eq 'Remove') {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output 'JobRadar schedule removed. An in-flight n8n execution may still be running.'
  exit
}
if($Mode -eq 'Status') {
  Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo | Format-List LastRunTime,LastTaskResult,NextRunTime
  exit
}
# Arguments contain paths only. Secrets stay inside the local env file.
$envFile=Join-Path $ProjectRoot '.env.integration'
$runner=Join-Path $ProjectRoot 'scripts\run-collector.cjs'
$arguments='"--env-file='+$envFile+'" "'+$runner+'"'
$action=New-ScheduledTaskAction -Execute $NodePath -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger=New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Hours 3)
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'JobRadar local collection every 3 hours; reports in .collector-state' -Force | Out-Null
Write-Output 'Installed: JobRadar Collector. First production run in about one minute, then every 3 hours while signed in. Docker and n8n must be running.'
