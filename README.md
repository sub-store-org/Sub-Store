<div align="center">
<br>
<img width="200" src="https://raw.githubusercontent.com/58xinian/icon/master/Sub-Store1.png" alt="Sub-Store">
<br>
<br>
<h2 align="center">Sub-Store<h2>
</div>

<p align="center" color="#6a737d">
Advanced Subscription Manager for QX, Loon, Surge, Stash and Shadowrocket.
</p>

[![Build](https://github.com/sub-store-org/Sub-Store/actions/workflows/main.yml/badge.svg)](https://github.com/sub-store-org/Sub-Store/actions/workflows/main.yml) ![GitHub](https://img.shields.io/github/license/sub-store-org/Sub-Store) ![GitHub issues](https://img.shields.io/github/issues/sub-store-org/Sub-Store) ![GitHub closed pull requests](https://img.shields.io/github/issues-pr-closed-raw/Peng-Ym/Sub-Store) ![Lines of code](https://img.shields.io/tokei/lines/github/sub-store-org/Sub-Store) ![Size](https://img.shields.io/github/languages/code-size/sub-store-org/Sub-Store) 

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/PengYM)
   
Core functionalities:

1. Conversion among various formats.
2. Subscription formatting.
3. Collect multiple subscriptions in one URL.

> The following descriptions of features may not be updated in real-time. Please refer to the actual available features for accurate information.
   
## 1. Subscription Conversion

### Supported Input Formats

- [x] SS URI
- [x] SSR URI
- [x] SSD URI
- [x] V2RayN URI
- [x] Hysteria2 URI
- [x] QX (SS, SSR, VMess, Trojan, HTTP, SOCKS5)
- [x] Loon (SS, SSR, VMess, Trojan, HTTP, SOCKS5, WireGuard, VLESS, Hysteria2)
- [x] Surge (SS, VMess, Trojan, HTTP, SOCKS5, TUIC, Snell, Hysteria2, SSR(external, only for macOS), WireGuard(Surge to Surge))
- [x] Surfboard (SS, VMess, Trojan, HTTP, SOCKS5, WireGuard(Surfboard to Surfboard))
- [x] Shadowrocket (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard, Hysteria, Hysteria2, TUIC)
- [x] Clash.Meta (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard, Hysteria, Hysteria2, TUIC)
- [x] Stash (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard, Hysteria, TUIC)
- [x] Clash (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard)

### Supported Target Platforms

- [x] QX
- [x] Loon
- [x] Surge
- [x] Surfboard
- [x] Stash
- [x] Clash.Meta
- [x] Clash
- [x] Shadowrocket
- [x] V2Ray
- [x] V2Ray URI
- [x] Plain JSON

## 2. Subscription Formatting

### Filtering

- [x] **Regex filter**
- [x] **Discard regex filter**
- [x] **Region filter**
- [x] **Type filter**
- [x] **Useless proxies filter**
- [x] **Script filter**

### Proxy Operations

- [x] **Set property operator**: set some proxy properties such as `udp`,`tfo`, `skip-cert-verify` etc.
- [x] **Flag operator**: add flags or remove flags for proxies.
- [x] **Sort operator**: sort proxies by name.
- [x] **Regex sort operator**: sort proxies by keywords (fallback to normal sort).
- [x] **Regex rename operator**: replace by regex in proxy names.
- [x] **Regex delete operator**: delete by regex in proxy names.
- [x] **Script operator**: modify proxy by script.
- [x] **Resolve Domain Operator**: resolve the domain of nodes to an IP address.

### Development

Install `pnpm`

Go to `backend` directories, install node dependencies:

```
pnpm install
```

1. In `backend`, run the backend server on http://localhost:3000

```
pnpm start
```

## LICENSE

This project is under the GPL V3 LICENSE.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store?ref=badge_large)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=sub-store-org/sub-store&type=Date)](https://star-history.com/#sub-store-org/sub-store&Date)


## Acknowledgements

- Special thanks to @KOP-XIAO for his awesome resource-parser. Please give a [star](https://github.com/KOP-XIAO/QuantumultX) for his great work!
- Special thanks to @Orz-3 and @58xinian for their awesome icons.
