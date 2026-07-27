$action = New-ScheduledTaskAction -Execute "node" -Argument "C:\docproc\scripts\minipc-watch.js" -WorkingDirectory "C:\docproc"
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
Register-ScheduledTask -TaskName "AI知识库看门狗" -Action $action -Trigger $trigger -RunLevel Highest -Force
