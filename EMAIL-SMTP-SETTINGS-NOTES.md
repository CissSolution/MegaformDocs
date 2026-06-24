MegaForm email service update

What changed
- Web SMTP sender now reads settings from MF_ModuleSettings first, then appsettings.
- Supports Host, Port, From, Username, Password, EnableSsl, ReplyTo, TimeoutMs.
- Added admin endpoints: /api/MegaForm/ModuleConfig/EmailSettings (+ Test).
- Added Email Settings modal in Web dashboard.
- Setup wizard now captures account/password/SSL and writes them to appsettings.Production.json.

Recommended SmarterASP first try
- Host: exact SMTP host from control panel
- Port: 25 or 8889 with SSL off, unless support confirms 465/SSL
- From: same mailbox as SMTP username
- Username: full email address
- Password: mailbox password

Build
- BuildTS.bat
- build.cmd
- pack.cmd
