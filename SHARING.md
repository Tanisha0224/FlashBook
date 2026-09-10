# QR photo downloads

Download PNG remains local. **Create QR** uploads a snapshot of the completed strip to the Flashbox server. Phones open an unguessable link, see the image, and save the original PNG. Links expire after one hour. Anyone holding the link can view it. Editing the print clears the displayed QR; old links keep their original snapshot until expiry.

## Hosting for access from anywhere

Deploy the included Dockerfile to a container host with HTTPS. Set:

```
PUBLIC_BASE_URL=https://your-flashbox-domain.example
PORT=8080
```

Use the actual HTTPS origin with no trailing path. The app and API must use this same origin. No third-party QR service receives the image or link. QR generation uses the [python-qrcode library](https://pypi.org/project/qrcode/).

Run **one instance and one worker**: storage is in process memory, capped at 128 MB/256 images, with a 10 MB individual upload limit. Multiple threads are supported. Restarting or redeploying the server invalidates existing links early. Disable scale-to-zero if links must remain available for their full hour. Set a request body limit of 10 MB and request timeout at the hosting proxy. For a busy public installation, add persistent expiring object storage and shared rate limiting before scaling horizontally.

No database, cloud account, or domain has been configured automatically. QR sharing is disabled until PUBLIC_BASE_URL is set; a localhost QR would not work on another device. Do not expose the Python development server directly to the internet; the Docker image uses Gunicorn behind your host's HTTPS proxy.

## Local verification

```
python -m pip install --target .runtime -r requirements.txt
python server.py
```

Open http://localhost:4174. QR creation displays a setup message without a configured public address. To test local API sharing, set PUBLIC_BASE_URL to http://localhost:4174 before starting. Such test links work only on the same computer.

Run `python -m unittest test_sharing.py`. Tests cover link creation, SVG QR response, the mobile page, byte-exact PNG downloads, expiration, upload validation, origin checks, rate limiting, and static-file restrictions. A real phone scan must still be checked after HTTPS deployment.
