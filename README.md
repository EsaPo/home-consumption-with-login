# Home consumption app / Omakotitalon kulutusseuranta

This app is designed for homes and allows you to track your electricity, heat and water consumption. You can also see monthly consumption graphs as you add up your readings month by month. This is an old-fashioned way of tracking your home's consumption and you need to read the meter monthly and add data to this app.

This app is created so that there is node.js backend by which your data is saved to SQLite database. Frontend is pure html file which communicate with this node.js backend.

### How to install

First you have to clone this repo and go to `backend` folder. Here you run command `npm install` which installs needed files. Then you have to modify `env.template` file and save it to `backend` folder with name `.env`.

After that you can start backend with command `node server.js` in your `backend/db/` folder. After that you can go to web browser and open the ip address http://127.0.0.1:2992. 

### How to start

In first login you have to create username and set password. This first user in so-called *admin* user. After first login you have to first create property before you can start add meter readings. Look for more in *ìnstructions* tab.
