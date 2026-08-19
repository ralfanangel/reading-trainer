# Synology local content hosting (dev)

If you want to serve updated JSON content and images from your Synology on the local network during development, a simple approach is:

1. Enable Docker on your Synology (Package Center -> Docker).
2. Create a small nginx or httpd container that serves a folder with assets.
   Example using the official nginx image and a simple static folder:

   - Create a folder on your Synology: `/volume1/docker/reading-trainer-content`
   - Place `animals.json` and any image assets there.
   - Run the container (example):

     docker run -d --name rt-content -p 8080:80 -v /volume1/docker/reading-trainer-content:/usr/share/nginx/html:ro nginx

3. From the iPad (on the same LAN) you can point the app to `http://<synology-ip>:8080/animals.json` to fetch updated content.

Security & notes
- For development this is fine. For production, prefer HTTPS and authenticated content updates.
- Ensure your Synology firewall allows the chosen port and that devices are on the same network.
