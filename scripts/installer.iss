; Inno Setup script — build LeadLoop-Setup.exe from dist\leadloop-1.0.0
; Run after `npm run dist`, then compile this file with Inno Setup 6.

[Setup]
AppId={{6A2E9B1C-4D5E-4F3A-8C7D-2B1F5A9E0C4D}
AppName=LeadLoop
AppVersion=1.0.0
AppPublisher=Local
DefaultDirName={localappdata}\LeadLoop
DefaultGroupName=LeadLoop
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=LeadLoop-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=LeadLoop
Uninstallable=yes

[Files]
Source: "..\dist\leadloop-1.0.0\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\LeadLoop"; Filename: "{app}\start.bat"; WorkingDir: "{app}"
Name: "{group}\Uninstall LeadLoop"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\start.bat"; Description: "Start LeadLoop"; Flags: nowait postinstall skipifsilent
