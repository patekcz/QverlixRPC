const { app, Tray, Menu, shell, clipboard, Notification } = require('electron');
const path = require('path');
const axios = require('axios');
const DiscordRPC = require('discord-rpc');
const APIurl = 'https://raw.githubusercontent.com/patekcz/API/main/DiscordRPC.json';
const widget = 'https://discord.com/api/guilds/583018158089306130/widget.json';

let rpcText = null; // Globální proměnná pro uchování rpcText

const gotTheLock = app.requestSingleInstanceLock();
let isCopyLink = false;

if (!gotTheLock) {
    // Aplikace již běží, pošle zprávu do existující instance
    app.quit();
} else {
    let tray = null;
    let rpc = null;
    let isRPCRunning = false;

    app.on('ready', () => {
        tray = new Tray(path.join(__dirname, './icons/icon.png'));

        const contextMenu = Menu.buildFromTemplate([
            { label: isRPCRunning ? 'Zastavit QverlixRPC' : 'Spustit QverlixRPC', type: 'normal', click: toggleRPC },
            { type: 'separator' },
            { label: 'Ukončit aplikaci', type: 'normal', click: () => { app.quit(); } },
            { type: 'separator'},
            { label: isCopyLink ? 'Odkaz zkopírován' : 'Sdílet', type: 'normal', click: copyLink },
        ]);

        tray.setContextMenu(contextMenu);

        // Načíst rpcText a spustit RPC klienta
        axios.get(APIurl)
            .then(response => {
                rpcText = response.data; // Uložení rpcText do globální proměnné
                startRPC(); // Spustit RPC klienta po načtení rpcText
            })
            .catch(error => {
                console.error('Chyba při načítání rpcText:', error);
            });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    function toggleRPC() {
        if (!isRPCRunning) {
            startRPC();
        } else {
            stopRPC();
        }
    }

    function startRPC() {
        if (!rpcText) {
            console.error('rpcText není načten!');
            return;
        }

        // Připojení RPC klienta
        rpc = new DiscordRPC.Client({ transport: 'ipc' });

        rpc.on('ready', () => {
            console.log('RPC připojen!');
            // První aktualizace stavu po připojení
            updateRPCActivity();
            
            // Nastavení opakovaného volání funkce updateRPCActivity každých 60 sekund
            setInterval(updateRPCActivity, 60000);
        });

        rpc.login({ clientId: '1123866982484299797' }).catch(console.error);
        isRPCRunning = true;
        updateContextMenu();
    }

    function stopRPC() {
        if (rpc) {
            // Odpojit RPC klienta
            rpc.destroy();
            rpc = null;
            isRPCRunning = false;
            updateContextMenu();
        } else {
            console.log('RPC klient není spuštěný');
        }
    }

    // Sdílení linků
    function copyLink() {
        if (!rpcText) {
            console.error('rpcText není načten!');
            return;
        }

        const webLink = rpcText.updateUrl; // Použití rpcText.updateUrl
        if (!isCopyLink) {
            isCopyLink = true;
            updateContextMenu();
            clipboard.writeText(webLink);
            console.log("Odkaz zkopírován");
    
            // Po kliknutí na tlačítko "Sdílet" se text změní zpět na "Sdílet" po 10 sekundách
            setTimeout(() => {
                isCopyLink = false;
                updateContextMenu(); // Aktualizuje kontextové menu po změně stavu
                console.log("Sdílet");
            }, 10000); // 10 sekund
        }
    }

    function updateContextMenu() {
        axios.get(APIurl)
            .then(response => {
                const rpcData = response.data;

                // Získání aktuální verze aplikace
                const currentVersion = app.getVersion();

                // Porovnání verzí
                const updateUrl = rpcData.updateUrl;
                const latestVersion = rpcData.version;

                let contextMenuTemplate = [
                    { label: isRPCRunning ? 'Zastavit QverlixRPC' : 'Spustit QverlixRPC', type: 'normal', click: toggleRPC },
                    { type: 'separator' },
                    { label: 'Ukončit aplikaci', type: 'normal', click: () => { app.quit(); } },
                    { type: 'separator'},
                    { label: isCopyLink ? 'Odkaz zkopírován' : 'Sdílet', type: 'normal', click: copyLink },
                ];

                // Přidání tlačítka pro aktualizaci pouze pokud je k dispozici novější verze
                if (updateUrl && latestVersion && currentVersion < latestVersion) {
                    contextMenuTemplate.push({ label: 'Aktualizace', type: 'normal', click: () => shell.openExternal(updateUrl) });
                }

                const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);
                tray.setContextMenu(contextMenu);
            })
            .catch(error => {
                console.error('Chyba při získávání dat pro kontextové menu:', error);
            });
    }

    function updateRPCActivity() {
        if (!rpcText) {
            console.error('rpcText není načten!');
            return;
        }

        axios.get(widget)
            .then(response => {
                const data = response.data;

                let countChannelIds = 0;

                for (let key in data) {
                    if (data[key].hasOwnProperty('channel_id')) {
                        countChannelIds++;
                    } else {
                        const nestedObjects = data[key];
                        for (let nestedKey in nestedObjects) {
                            if (nestedObjects[nestedKey].hasOwnProperty('channel_id')) {
                                countChannelIds++;
                            }
                        }
                    }
                }

                // RPC skloňování textu
                let callWord;
                if (countChannelIds === 0) {
                    callWord = 'volá';
                } else {
                    callWord = (countChannelIds === 1 || countChannelIds >= 5) ? 'volá' : 'volají';
                }

                let playerWord;
                if (countChannelIds === 0) {
                    playerWord = 'hráčů';
                } else if (countChannelIds === 1) {
                    playerWord = 'hráč';
                } else if (countChannelIds % 10 === 2 || countChannelIds % 10 === 3 || countChannelIds % 10 === 4 || countChannelIds === 22 || countChannelIds === 23 || countChannelIds === 24) {
                    playerWord = 'hráči';
                } else {
                    playerWord = 'hráčů';
                }

                let stateText = `${rpcText.state} ${callWord} ${countChannelIds} ${playerWord}`;
                if (countChannelIds === 0) {
                    stateText = `${rpcText.state} ${callWord} ${countChannelIds} ${playerWord}`;
                }

                // RPC status
                rpc.setActivity({
                    details: rpcText.details,
                    state: stateText,
                    largeImageKey: rpcText.largeImageKey,
                    largeImageText: rpcText.largeImageText,
                    smallImageKey: rpcText.smallImageKey,
                    smallImageText: rpcText.smallImageText,
                    buttons: rpcText.buttons,
                    instance: false,
                });
            })
            .catch(error => {
                console.error('Chyba při získávání dat:', error);
            });
    }
}
