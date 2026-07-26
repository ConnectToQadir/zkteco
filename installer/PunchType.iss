; =============================================================================
; PunchType — Windows installer (Option A)
; =============================================================================
; Build on Windows ONLY:
;   1) npm install
;   2) npm run build
;   3) npm run build:installer
;      (or open this file in Inno Setup Compiler and click Compile)
;
; Output for your website:
;   release\PunchType-Setup-1.0.0.exe
;
; Customer installs to:
;   C:\Program Files\PunchType\
; Then they can delete the downloaded Setup.exe.
; =============================================================================

#define MyAppName "PunchType"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "PunchType"
#define MyAppExeName "PunchType.exe"
#define MyAppURL "http://127.0.0.1:47825"
#define MyAppId "{{8F3C2A71-9D44-4E1B-9F6A-71B2C0D4E5F6}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
LicenseFile=
InfoBeforeFile=
OutputDir=..\release
OutputBaseFilename=PunchType-Setup-{#MyAppVersion}
SetupIconFile=
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut for Settings"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "autostart"; Description: "Start {#MyAppName} automatically with Windows"; GroupDescription: "Startup options:"; Flags: checkedonce

[Dirs]
Name: "{app}\license"; Permissions: users-modify
Name: "{app}\logs"; Permissions: users-modify
; config.enc is created at runtime next to the exe
Name: "{app}"; Permissions: users-modify

[Files]
; Main application (built by npm run build into dist\)
Source: "..\dist\PunchType.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\keys\*"; DestDir: "{app}\keys"; Flags: ignoreversion recursesubdirs createallsubdirs
; Settings shortcut helper
Source: "PunchType-Settings.url"; DestDir: "{app}"; Flags: ignoreversion
; Placeholders so folders exist even if empty at build time
Source: "..\dist\license\*"; DestDir: "{app}\license"; Flags: ignoreversion skipifsourcedoesntexist recursesubdirs createallsubdirs
Source: "..\dist\logs\*"; DestDir: "{app}\logs"; Flags: ignoreversion skipifsourcedoesntexist recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--background"; Comment: "Run PunchType in the background"
Name: "{group}\{#MyAppName} Settings"; Filename: "{app}\PunchType-Settings.url"; Comment: "Open local settings page"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName} Settings"; Filename: "{app}\PunchType-Settings.url"; Tasks: desktopicon

[Registry]
; Optional autostart (same as in-app Windows Startup setting)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "PunchType"; \
    ValueData: """{app}\{#MyAppExeName}"" --background"; \
    Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--background"; \
    Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent
Filename: "{app}\PunchType-Settings.url"; \
    Description: "Open {#MyAppName} Settings"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
; Stop background process if still running (best-effort)
Filename: "{cmd}"; Parameters: "/C taskkill /IM {#MyAppExeName} /F"; Flags: runhidden; RunOnceId: "StopPunchType"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\config.enc"
Type: files; Name: "{app}\config.enc.tmp"
; Keep license.dat by default so reinstall can reuse it.
; Uncomment next line to remove license on uninstall:
; Type: files; Name: "{app}\license\license.dat"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
