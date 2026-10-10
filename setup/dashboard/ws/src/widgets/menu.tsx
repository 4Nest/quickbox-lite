// SPDX-License-Identifier: GPL-3.0-or-later

import { getPackage } from "../info";
import { username } from "../shared/constants";
import { getProcessList, processExistsIn } from "../utils/helpers";
import { isPackageInstalled } from "./panels";

interface MenuEntry {
    package?: string;
    lockfile?: string;
    name: string;
    url: string;
    logo?: string;
}

export interface DashboardMenuState {
    installedMenuEntries: MenuEntry[];
    installedDownloadEntries: MenuEntry[];
    showWebConsole: boolean;
}

const menuEntries: MenuEntry[] = [
    { package: "rutorrent", name: "ruTorrent", url: "/rutorrent/", logo: "/console-assets/app-icons/rtorrent.png" },
    { package: "flood", name: "Flood", url: "/$username$/flood/", logo: "/console-assets/app-icons/flood.png" },
    { package: "deluge", name: "Deluge Web", url: "/deluge/", logo: "/console-assets/app-icons/deluge.png" },
    { package: "transmission", name: "Transmission Web Control", url: "/transmission", logo: "/console-assets/app-icons/transmission.png" },
    { package: "qbittorrent", name: "qBittorrent", url: "/qbittorrent/", logo: "/console-assets/app-icons/qbittorrent.png" },
    { package: "btsync", name: "BTSync", url: "/$username$.btsync/", logo: "/console-assets/app-icons/btsync.png" },
    { package: "emby", name: "Emby", url: "/emby/", logo: "/console-assets/app-icons/emby.png" },
    { package: "filebrowser", name: "File Browser", url: "/filebrowser/", logo: "/console-assets/app-icons/filebrowser.png" },
    { package: "filebrowser-ee", name: "File Browser Enhanced", url: "/filebrowser-ee/", logo: "/console-assets/app-icons/filebrowser.png" },
    { package: "flexget", name: "FlexGet", url: "/flexget/", logo: "/console-assets/app-icons/flexget.png" },
    { package: "jellyfin", name: "Jellyfin", url: "/jellyfin/", logo: "/console-assets/app-icons/jellyfin.png" },
    { package: "netdata", name: "NetData", url: "/netdata/", logo: "/console-assets/app-icons/netdata.png" },
    { package: "novnc", name: "noVNC", url: "/vnc/", logo: "/console-assets/app-icons/novnc.png" },
    { package: "pbh", name: "PeerBanHelper", url: "/pbh/", logo: "/console-assets/app-icons/peerbanhelper.png" },
    { package: "plex", name: "Plex", url: "/web/", logo: "/console-assets/app-icons/plex.png" },
    { package: "rclone", name: "Rclone", url: "/rclone/", logo: "/console-assets/app-icons/rclone.png" },
    { package: "sabnzbd", name: "SABnzbd", url: "/sabnzbd", logo: "/console-assets/app-icons/sabnzbd.png" },
    { package: "speedtest", name: "SpeedTest", url: "/speedtest/", logo: "/console-assets/app-icons/speedtest.png" },
    { package: "syncthing", name: "Syncthing", url: "/$username$.syncthing/", logo: "/console-assets/app-icons/syncthing.png" },
    { package: "znc", name: "ZNC", url: "/znc/", logo: "/console-assets/app-icons/znc.png" },
];

const downloadEntries: MenuEntry[] = [
    { package: "rtorrent", name: "rTorrent", url: "/$username$.rtorrent.downloads" },
    { package: "deluge", name: "Deluge", url: "/$username$.deluge.downloads" },
    { package: "transmission", name: "Transmission", url: "/$username$.transmission.downloads" },
    { package: "qbittorrent", name: "qBittorrent", url: "/$username$.qbittorrent.downloads" },
    {
        lockfile: "/home/$username$/openvpn/$username$.zip",
        name: "OpenVPN Config",
        url: "/$username$/ovpn.zip",
    },
];

const resolveUsernameTemplate = (value: string) => value.replaceAll("$username$", username);

function isEntryInstalled(entry: MenuEntry) {
    if (entry.package) {
        const pkg = getPackage(entry.package);
        return pkg ? isPackageInstalled(pkg) : false;
    }
    if (entry.lockfile) {
        return isPackageInstalled({ lockfile: resolveUsernameTemplate(entry.lockfile) });
    }
    return false;
}

async function isWebConsoleVisible() {
    const ttyd = getPackage("ttyd");
    if (!ttyd || !isPackageInstalled(ttyd) || !ttyd.services) {
        return false;
    }
    const services = Object.values(ttyd.services);
    if (!services.length) {
        return false;
    }
    const processList = await getProcessList();
    return services.every((service) => processExistsIn(processList, service.process ?? "", service.username));
}

export async function resolveDashboardMenuState(): Promise<DashboardMenuState> {
    const installedMenuEntries = menuEntries.filter(isEntryInstalled);
    const installedDownloadEntries = downloadEntries.filter(isEntryInstalled);
    const showWebConsole = await isWebConsoleVisible();

    return {
        installedMenuEntries,
        installedDownloadEntries,
        showWebConsole,
    };
}
