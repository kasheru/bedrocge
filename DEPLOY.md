# Deploying BEDROC on Oracle Cloud (Always Free, India)

Result: the site and admin live at `https://bedrocge.com`, always on, free HTTPS, your admin edits and uploads kept on the server's disk.

Oracle's console wording changes now and then; where a menu name differs slightly, follow the same idea.

## 1. Create the Oracle account (India region)

1. Sign up at <https://www.oracle.com/cloud/free/>.
2. **Home region: choose `India West (Mumbai)` or `India South (Hyderabad)`.** This cannot be changed later, and Always Free resources only exist in the home region.
3. A card is needed for identity verification. You are not charged for Always Free resources.
4. Consider upgrading to "Pay As You Go" afterwards (you still pay nothing while you stay inside the Always Free limits). Oracle can reclaim Always Free instances it sees as idle; paid-tier accounts are not reclaimed. Check Oracle's current policy.

## 2. Create the server (VM)

**Compute → Instances → Create instance**

- **Image:** Canonical Ubuntu 22.04.
- **Shape:** *Change shape* →
  - `VM.Standard.E2.1.Micro` (AMD, Always Free): small but plenty for this site, and normally available.
  - or `VM.Standard.A1.Flex` (Ampere, 1 OCPU / 6 GB, Always Free): faster, but Mumbai often says "Out of capacity". If so, use the Micro.
- **Networking:** keep "Assign a public IPv4 address" on.
- **SSH keys:** *Generate a key pair* and **download the private key**. You need it to log in. Keep it safe.

Then **Networking → IP management → Reserved public IPs**, reserve one and attach it to the VM, so the address never changes. Note it down as `SERVER_IP`.

## 3. Open the web ports (two places)

**a) Oracle firewall:** Instance → *Subnet* → *Security list* → **Add ingress rules**
Source `0.0.0.0/0`, protocol TCP, destination port `80`. Add a second rule for `443`.

**b) The VM's own firewall:** log in (see below) and run:

```bash
sudo iptables -L INPUT --line-numbers      # note the number of the REJECT rule
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT    # use a number just ABOVE the REJECT line
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

## 4. Log in

On Windows (PowerShell), from the folder with the downloaded key:

```powershell
ssh -i .\ssh-key.key ubuntu@SERVER_IP
```

## 5. Install Node, Git and the site

```bash
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
git clone https://github.com/kasheru/bedrocge.git ~/bedrocge
```

If the repo is private, create a GitHub personal access token with read access and clone with
`https://<token>@github.com/kasheru/bedrocge.git`.

## 6. Configure secrets

```bash
cd ~/bedrocge
nano .env
```

```
HOST=127.0.0.1
PORT=3000
ADMIN_PASSWORD=choose-a-long-password-here
ENQUIRY_WEBHOOK=https://script.google.com/macros/s/XXXX/exec
ENQUIRY_SECRET=the-same-string-as-SECRET-in-Code.gs
```

`ADMIN_PASSWORD` is used the first time the server starts. Afterwards you can change it in Admin → Account.

## 7. Run it as a service (restarts on crash and reboot)

```bash
sudo tee /etc/systemd/system/bedrocge.service > /dev/null <<'EOF'
[Unit]
Description=BEDROC website
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/bedrocge
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now bedrocge
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/     # should print 200
```

## 8. HTTPS with Caddy (automatic free certificate)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
bedrocge.com, www.bedrocge.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
EOF
sudo systemctl reload caddy
```

Do this step **after** the DNS in step 9 points at the server, or the certificate request will fail (Caddy retries by itself).

## 9. Point the GoDaddy domain at the server

GoDaddy → *My Products* → your domain → **DNS** → **DNS Records**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `SERVER_IP` | 600 |
| A | `www` | `SERVER_IP` | 600 |

Delete any existing `A` record for `@` that points to GoDaddy parking, and any "forwarding" for the domain. Changes usually take minutes, sometimes up to a few hours.

Then open `https://bedrocge.com` and `https://bedrocge.com/admin`.

## 10. After going live

- Sign in to `/admin`, change the password (Account tab) and confirm your content.
- Submit a test enquiry and check the sheet and email arrive.
- **Updating the site later:**
  ```bash
  cd ~/bedrocge && git pull && sudo systemctl restart bedrocge
  ```
  Your content (`data/`) and uploads (`uploads/`) are not in git, so updates never overwrite them.

## 11. Backups (do not skip)

Everything you edit lives in `data/` and `uploads/` on the server. Daily local copy, keeping 14 days:

```bash
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 2 * * * tar czf ~/backups/bedroc-$(date +\%F).tgz -C ~/bedrocge data uploads && find ~/backups -mtime +14 -delete' ) | crontab -
```

A copy on the same server does not survive losing the server, so also pull one to your PC now and then (PowerShell):

```powershell
scp -i .\ssh-key.key -r ubuntu@SERVER_IP:~/backups .\bedroc-backups
```

## Troubleshooting

- **Site won't load, certificate error:** DNS has not propagated yet, or ports 80/443 are not open in *both* places (step 3).
- **502 from Caddy:** the app isn't running. `sudo systemctl status bedrocge` and `journalctl -u bedrocge -n 50`.
- **Enquiries not reaching the sheet:** `journalctl -u bedrocge | grep enquiry`. They are always saved in Admin → Enquiries regardless.
- **"Out of capacity" creating the VM:** use the AMD Micro shape, or retry later.
