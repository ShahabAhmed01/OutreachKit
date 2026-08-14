; Inno Setup script — build OutreachKit-Setup.exe from dist\outreachkit-1.0.0
; Run after `npm run dist`, then compile this file with Inno Setup 6.

[Setup]
AppId={{6A2E9B1C-4D5E-4F3A-8C7D-2B1F5A9E0C4D}
AppName=OutreachKit
AppVersion=1.0.0
AppPublisher=Local
DefaultDirName={localappdata}\OutreachKit
DefaultGroupName=OutreachKit
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=OutreachKit-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=OutreachKit
Uninstallable=yes

[Files]
Source: "..\dist\outreachkit-1.0.0\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\OutreachKit"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{group}\Uninstall OutreachKit"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\start.bat"; Description: "Start OutreachKit"; Flags: nowait postinstall skipifsilent
