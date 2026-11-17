# Deploying NIB Digital Products on Windows Server

The backend and frontend run directly with Node.js as two Windows services, with
IIS in front for HTTPS. No Docker, and no Redis: sign-in sessions, rate limits
and two-step codes are kept in PostgreSQL (`KV_STORE=postgres`).

```
Browser ──https──> IIS (443) ──> Frontend (127.0.0.1:3030) ──> Backend (:4000) ──> PostgreSQL (bank)
```

| Name | Value |
|---|---|
| Site address | `https://digitalproductstest.nibbank.com.et` |
| Program folder | `C:\apps\digitalproducts` |
| Windows services | `DigitalProductsBackend`, `DigitalProductsFrontend` |
| IIS site | `DigitalProducts`, folder `C:\inetpub\digitalproducts` |
| Database | `digitalproducts` |
| Logs | `C:\apps\digitalproducts\logs` |

Run every command in **PowerShell as Administrator**, except step 5a, which uses Command Prompt.

## Before you start

- [ ] **Node.js 24 or newer** (`node -v`) and **Git** (`git --version`).
- [ ] **Internet access** from the server, for `npm ci` and the web font downloaded at build time.
- [ ] **PostgreSQL:** host, user and password, and an empty database named `digitalproducts`. The user can create the database instead, if it is allowed to.
- [ ] **HTTPS certificate** for `digitalproductstest.nibbank.com.et` in *Local Computer → Personal*.
- [ ] **DNS:** the name points to this server.
- [ ] **IIS**, with **URL Rewrite 2.1** and **Application Request Routing 3.0** (free Microsoft downloads).
- [ ] **NSSM** from nssm.cc, with `nssm.exe` on the PATH.

## 1. Get the code

```powershell
git clone https://github.com/ABIY-ALT/NIB-Digital-Solutions.git C:\apps\digitalproducts
```

Clone the code, or download the ZIP. Do not copy the folder from a developer PC: its `.env.local` files would override the server settings.

## 2. Settings

```powershell
cd C:\apps\digitalproducts
Copy-Item backend\.env.windows.example backend\.env
Copy-Item frontend\.env.windows.example frontend\.env.production
notepad backend\.env
```

In Notepad, fill in the `CHANGE_ME` line, **`DATABASE_URL`**. For example: `postgresql://dp_user:Pa%40ss@10.1.2.3:5432/digitalproducts?schema=public`. In the password, write `@` as `%40` and `#` as `%23`.

For another site address, also change `PUBLIC_APP_URL` and `CORS_ORIGINS` here, and `AUTH_URL` and `SITE_URL` in `frontend\.env.production`.

Then generate all the secrets in both files:

```powershell
node deploy\windows\fill-secrets.mjs
```

**Copy `backend\.env` and `frontend\.env.production` somewhere safe.** If the secrets are lost:
- users can no longer use two-step verification;
- the audit trail can no longer be verified.

## 3. Build and set up the database

```powershell
cd C:\apps\digitalproducts\backend
npm ci
npm run build
node dist/cli/main.js config:check --env-file .env --production   # must end with "valid"
npm run db:setup                                                  # creates the database if needed, runs migrations

cd C:\apps\digitalproducts\frontend
npm ci
npx tsx src/cli/main.ts env:check --env-file .env.production --backend-env ..\backend\.env --production
npm run build
Copy-Item public .next\standalone\ -Recurse -Force
Copy-Item .next\static .next\standalone\.next\ -Recurse -Force
```

`config:check` may warn that the database connection is not encrypted. That's fine to start with. If the bank's PostgreSQL supports TLS, add `&sslmode=require` to `DATABASE_URL`.

`npm run db:setup` also creates the two tables that hold sign-in sessions and rate limits (`kv_entries`, `kv_set_members`).

## 4. Windows services

```powershell
$app  = 'C:\apps\digitalproducts'
$node = (Get-Command node).Source
New-Item -ItemType Directory "$app\logs" -Force | Out-Null

nssm install DigitalProductsBackend  $node "--env-file=.env dist\main.js"
nssm set     DigitalProductsBackend  AppDirectory "$app\backend"
nssm install DigitalProductsFrontend $node "--env-file=..\..\.env.production server.js"
nssm set     DigitalProductsFrontend AppDirectory "$app\frontend\.next\standalone"
nssm set     DigitalProductsFrontend DependOnService DigitalProductsBackend

foreach ($s in 'Backend', 'Frontend') {
  $log = "$app\logs\$($s.ToLower()).log"
  nssm set "DigitalProducts$s" AppStdout $log
  nssm set "DigitalProducts$s" AppStderr $log
  nssm set "DigitalProducts$s" AppRotateFiles 1
  nssm set "DigitalProducts$s" AppRotateOnline 1
  nssm set "DigitalProducts$s" AppRotateBytes 10485760
  nssm start "DigitalProducts$s"
}

curl.exe http://127.0.0.1:4000/health/ready   # backend: 200 when the database answers
curl.exe http://127.0.0.1:3030/api/health     # frontend: 200
```

The services start with Windows and restart automatically if they stop. By default they run as *Local System*. To run them under a dedicated service account instead, use `nssm set <service> ObjectName <account> <password>`. That account needs read access to the program folder, and write access to `logs` and `backend\storage`.

## 5. HTTPS with IIS

**a) One-time server settings.** Run these in **Command Prompt** as Administrator. If a line reports that an entry already exists, ignore it.

```
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /includePortInXForwardedFor:"False" /responseBufferLimit:"0" /commit:apphost
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_HOST']" /commit:apphost
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
```

**b) The site folder:**

```powershell
New-Item -ItemType Directory C:\inetpub\digitalproducts -Force
Copy-Item C:\apps\digitalproducts\deploy\windows\web.config C:\inetpub\digitalproducts\
```

**c) The site**, in IIS Manager:
1. Right-click **Sites**, choose **Add Website**, and set:
   - **Name:** `DigitalProducts`
   - **Physical path:** `C:\inetpub\digitalproducts`
   - **Binding:** type `https`, port `443`
   - **Host name:** `digitalproductstest.nibbank.com.et`
   - **Require Server Name Indication:** ticked
   - **SSL certificate:** the bank's certificate
2. Optional: under **Bindings**, add `http` on port `80` with the same host name. `web.config` then redirects it to https.
3. Under **Application Pools → DigitalProducts → Basic Settings**, set **.NET CLR version** to *No Managed Code*.

**d) Firewall.** Open only 443, plus 80 if you added the http binding. Keep 3030 and 4000 closed: the backend accepts connections on every network interface.

```powershell
New-NetFirewallRule -DisplayName "Digital Products HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

## 6. Roles and the first administrator

`permissions:sync` loads the permissions and the standard roles (`SUPER_ADMIN`, `ADMIN`, …) into the new database. It creates no users and no sample data. Without it, `users:create` answers `Unknown roles: SUPER_ADMIN`.

```powershell
cd C:\apps\digitalproducts\backend
node --env-file=.env dist/cli/main.js permissions:sync --operator "<your name>" --reason "initial setup" --yes
node --env-file=.env dist/cli/main.js users:create --username admin --email admin@nib.et --full-name "Administrator" --role SUPER_ADMIN --operator "<your name>" --reason "initial setup" --yes
```

The command shows a temporary password once. Open `https://digitalproductstest.nibbank.com.et` and sign in with it. The site then asks you to:
- choose a new password;
- set up two-step verification.

## Updating to a new version

1. Back up the database first. Migrations are never undone.
2. Run:
   ```powershell
   nssm stop DigitalProductsFrontend
   nssm stop DigitalProductsBackend

   cd C:\apps\digitalproducts
   git pull
   git diff HEAD@{1} -- backend/.env.windows.example frontend/.env.windows.example   # new settings to copy over?
   ```
3. Repeat step 3.
4. Load the permissions of the new version (it changes nothing that already exists):
   ```powershell
   cd C:\apps\digitalproducts\backend
   node --env-file=.env dist/cli/main.js permissions:sync --operator "<your name>" --reason "release update" --yes
   ```
5. Run `nssm start DigitalProductsBackend`, then `nssm start DigitalProductsFrontend`.

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| IIS error **500.19** | URL Rewrite is not installed, or step 5a was not run. |
| IIS error **502** | The frontend service is not running (`nssm status DigitalProductsFrontend`, `logs\frontend.log`), or `web.config` points to the wrong port. |
| A service stops right after starting | Invalid settings. Read `logs\backend.log` or `logs\frontend.log`, and run the `config:check` / `env:check` lines from step 3. |
| `/health/ready` does not return 200 | The database cannot be reached, or `npm run db:setup` has not run since the last update (the session tables are missing). Check `DATABASE_URL` and the network path to the database server. |
| Sign-in goes back to the sign-in page | The site was opened over `http://`, or `AUTH_URL` is not the exact `https://` address. |
| "The request could not be verified" on every form | IIS changed the Host header: run step 5a. Or the `HTTP_X_FORWARDED_HOST` value in `web.config` differs from the address in the browser. |
| Pages without styling, `/_next/static` returns 404 | The two `Copy-Item` lines after `npm run build` were skipped. |
