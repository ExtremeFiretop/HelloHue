# HelloHue 

## Updates in 1.0.2 - Minimum Changes to Bring to Date

 - Bootstrap 5 migration – All data-toggle attributes changed to data-bs-toggle, alerts now use .btn-close instead of .close, and form elements updated (e.g., .custom-select → .form-select).
 - Native tab handling – Removed jQuery’s $(...).tab(), now uses the new bootstrap.Tab API for tab navigation.
 - Unique tab IDs – Fixed an issue causing the wrong tab to show on refresh by assigning unique IDs for links and content panes.
 - Tooltip improvements – Switched to Bootstrap 5’s native bootstrap.Tooltip initialization instead of the jQuery approach.
 - Script ordering – Ensured jQuery is loaded before Bootstrap scripts for proper Bootstrap Select functionality.
 - Minor tweaks & refactoring – Adjusted classes, patterns, and placeholders to align with Bootstrap 5 best practices and reduce console warnings.

## Updates in 1.0.1

 - Adjustable transition time for brightness changes
 - Fixed minimum media duration by implementing async handling
 - Simplified console logging
 - General refactor of `automation.js`

##### Sync Philips Hue lights with Plex!

**Requirements**

 - A Plex Pass subscription
 - A computer with Git / Node 8 / NPM 5 (alternatively, a Docker image is available)
 
### Warning

This app is the standalone equivalent of the [HelloHue.bundle](https://github.com/ledge74/HelloHue.bundle) Plex Plugin. This is not a Plex Plugin, as Plugins will be deprecated soon.

### Behavior

This application detects when a media is playing, paused or stopped on your Plex Clients. Then it checks the client name, and the user who owns the stream. If it matches your criteria, it triggers your lights with the actions you have set up.

### Installation with Node

 1. `git clone https://github.com/bam2000/HelloHue.git`
 2. `cd HelloHue`
 3. `npm i`
 4. `npm start`

### Configure Plex Webhook

Plex needs to send webhooks to HelloHue in order for the channel to work. For example, if HelloHue uses the default port and is on the same machine as your Plex Media Server, the webhook url will be :
`http://127.0.0.1:4568/`

Read [this support article](https://support.plex.tv/articles/115002267687-webhooks/) in order to learn how to create a Plex webhook

### Configure HelloHue

 - In a browser, go the HelloHue app url, for example `http://127.0.0.1:4568/` if you are on the machine that runs HelloHue.
 1. Configure everything : Hue bridge, Plex server, Location.
 2. Then configure your Rooms. One room is composed of **one Player**, **one or multiple User(s)** and **one or multiple Hue Lights/Groups**. Below is some additional details about the most important settings :
	 - `Plex Player name` you can find your Plex Players in your Plex Media Server -> settings -> Authorized devices. Only put ONE client per room. If your have two clients in the same room, activate an other room and fill the settings with the other clients name and the same lights names.
	 - `Plex Users names` you can find the list of users in Plex Media Server -> settings -> home users. You can put multiple users (comma separated values, case sensitive).
	 - You need to tick `Activate this room` in order for light actions to get triggered.

### HelloHue api

Three endpoints are available. You may use them to integrate with [homebridge](https://github.com/nfarina/homebridge) or [home-assistant](https://www.home-assistant.io/) for example :

 - `GET /api/start`
 - `GET /api/stop`
 - `GET /api/status`
	 - Returns `1` if HelloHue is started
	 - Returns `0` if HelloHue is stopped

### Example docker-compose file

HelloHue is also available as a [Docker image](https://hub.docker.com/r/ledge74/hellohue/)

    version: "3"
    
    services:
      hellohue:
        container_name: hellohue
        volumes:
          - ./hellohue:/app/db
        ports:
          - "4568:4568"
        environment:
          - TZ=Europe/Paris
        network_mode: host
        restart: unless-stopped

### Example homebridge-http integration
Integrate with [homebridge](https://github.com/nfarina/homebridge) and [homebridge-http](https://github.com/rudders/homebridge-http)

	{
        	"accessory": "Http",
        	"name": "HelloHue",
        	"switchHandling": "yes",
        	"http_method": "GET",
        	"on_url":      "http://127.0.0.1:4568/api/start",
        	"off_url":     "http://127.0.0.1:4568/api/stop",
        	"status_url":  "http://127.0.0.1:4568/api/status",
        	"service": "Switch",
        	"brightnessHandling": "no",
        	"brightness_url":     "http://localhost/controller/1707/%b",
        	"brightnesslvl_url":  "http://localhost/status/100054",
        	"sendimmediately": "",
        	"username" : "",
        	"password" : ""                     
	},

### Example Home-Assistant integration

    - platform: command_line
      switches:
        hellohue:
          command_on: "/usr/bin/curl -X GET http://127.0.0.1:4568/api/start"
          command_off: "/usr/bin/curl -X GET http://127.0.0.1:4568/api/stop"
          command_state: "/usr/bin/curl -X GET http://127.0.0.1:4568/api/status"
          value_template: '{{ value == "1" }}'
          friendly_name: HelloHue
	  
	  
### Example of Systemd Autostart

		sudo nano /etc/systemd/system/hellohue.service 
	
with the following Content

		[Unit]
		Description=HelloHue
		After=network.target

		[Service]
		Environment=NODE_PORT=4568
		Type=simple
		User=pi
		WorkingDirectory=/home/pi/HelloHueMod/
		ExecStart=/usr/local/bin/node index.js
		Restart=on-failure

		[Install]
		WantedBy=multi-user.target
		
Enable Systemctl
		
		systemctl enable hellohue.service
		
	
Check Status of Systemctl

		systemctl status hellohue.service


### Support the project
I've modified HelloHue
if you want to donate please go to the original page
https://github.com/ledge74/HelloHue
