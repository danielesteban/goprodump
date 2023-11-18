goprodump
==

I bought myself a GoPro camera as an incentive for going outside and touch grass.

But apparently the only ways to transfer the camera files over WIFI are to use a proprietary mobile app and, of course, a paid cloud subscription without an option to host your own server.

Just when I thought I was out, they pull me back in.

Thankfully, most of the firmware is opensource and the APIs are pretty well documented:

 * [Bluetooth Low Energy (BLE) Specification v2.0](https://gopro.github.io/OpenGoPro/ble_2_0)
 * [HTTP Specification v2.0](https://gopro.github.io/OpenGoPro/http_2_0)

So... I wrote [this nodejs script](src/main.js) to dump the camera files over WIFI into a computer:

 * Connects to the camera through BLE
 * Enables the camera WIFI access point
 * Connects the computer to the camera through WIFI
 * Lists all the media in the camera
 * Sets the camera into TurboTransfer mode
 * Downloads all the files skipping the already downloaded ones
 * Disconnects everything and puts the camera to sleep

> The camera needs be at the "Pair Device" screen the first time the script runs or the BLE connection won't work.

This has only been tested on a Windows 10 computer with a CSR4.0 bluetooth dongle with the [WinUSB drivers](https://zadig.akeo.ie/).

```bash
# clone repo:
git clone https://github.com/danielesteban/goprodump.git
cd goprodump
# install dependencies:
pnpm install
# set camera at "Pair Device" screen
# dump all files:
pnpm start --id "Last 4 digits from the camera serial number"
# print out usage options:
pnpm start --help
```

If everything worked out, it should print out something like this:
```bash
$ pnpm start --id "0123"

> goprodump@ start C:\Users\dani\Code\goprodump
> node src/main.js "--id" "0123"

Connecting BLE...
[0123] HERO12 Black
Enabling AP...
Connecting WIFI...
Listing media...
7 files on camera
Downloading 3 new files to:
C:\Users\dani\Code\goprodump\output\0123
[3/3] |>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>|    100%
GX010007.MP4 |████████████████████████| 100% [27.41mb/s]
Shutting down...
Done!
```
