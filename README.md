<div align="center">
<br>
<img width="200" src="https://raw.githubusercontent.com/cc63/ICON/main/Sub-Store.png" alt="Sub-Store">
<br>
<br>
<h2 align="center">Sub-Store<h2>
</div>

<p align="center" color="#6a737d">
Advanced Subscription Manager for QX, Loon, Surge, Stash, Egern and Shadowrocket.
</p>

[![Build](https://github.com/sub-store-org/Sub-Store/actions/workflows/main.yml/badge.svg)](https://github.com/sub-store-org/Sub-Store/actions/workflows/main.yml) ![GitHub](https://img.shields.io/github/license/sub-store-org/Sub-Store) ![GitHub issues](https://img.shields.io/github/issues/sub-store-org/Sub-Store) ![GitHub closed pull requests](https://img.shields.io/github/issues-pr-closed-raw/Peng-Ym/Sub-Store) ![Lines of code](https://img.shields.io/tokei/lines/github/sub-store-org/Sub-Store) ![Size](https://img.shields.io/github/languages/code-size/sub-store-org/Sub-Store)
<a href="https://trendshift.io/repositories/4572" target="_blank"><img src="https://trendshift.io/api/badge/repositories/4572" alt="sub-store-org%2FSub-Store | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/PengYM)

Core functionalities:

1. Conversion among various formats.
2. Subscription formatting.
3. Collect multiple subscriptions in one URL.

> The following descriptions of features may not be updated in real-time. Please refer to the actual available features for accurate information.

## 1. Subscription Conversion

### Supported Input Formats

> ⚠️ Do not use `Shadowrocket` to export URI and then import it as input. It is not a standard URI.

- [x] Normal Proxy(`socks5`, `socks5+tls`, `http`, `https`(it's ok))

  example: `socks5+tls://user:pass@ip:port#name`

- [x] URI(SS, SSR, VMess, VLESS, Trojan, Hysteria, Hysteria 2, TUIC v5, WireGuard)
- [x] Clash Proxies YAML
- [x] Clash Proxy JSON(single line)
- [x] QX (SS, SSR, VMess, Trojan, HTTP, SOCKS5, VLESS)
- [x] Loon (SS, SSR, VMess, Trojan, HTTP, SOCKS5, SOCKS5-TLS, WireGuard, VLESS, Hysteria 2)
- [x] Surge (Direct, SS, VMess, Trojan, HTTP, SOCKS5, SOCKS5-TLS, TUIC, Snell, Hysteria 2, SSH(Password authentication only), External Proxy Program(only for macOS), WireGuard(Surge to Surge))
- [x] Surfboard (SS, VMess, Trojan, HTTP, SOCKS5, SOCKS5-TLS, WireGuard(Surfboard to Surfboard))
- [x] Clash.Meta (Direct, SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard, Hysteria, Hysteria 2, TUIC, SSH, mieru)
- [x] Stash (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard, Hysteria, TUIC, Juicity, SSH)
- [x] Clash (SS, SSR, VMess, Trojan, HTTP, SOCKS5, Snell, VLESS, WireGuard)

### Supported Target Platforms

- [x] Plain JSON
- [x] Stash
- [x] Clash.Meta(mihomo)
- [x] Clash
- [x] Surfboard
- [x] Surge
- [x] SurgeMac(Use mihomo to support protocols that are not supported by Surge itself)
- [x] Loon
- [x] Egern
- [x] Shadowrocket
- [x] QX
- [x] sing-box
- [x] V2Ray
- [x] V2Ray URI

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
pnpm i
```

1. In `backend`, run the backend server on http://localhost:3000

babel(old school)

```
pnpm start
```

or

esbuild(experimental)

```
SUB_STORE_BACKEND_API_PORT=3000 pnpm run --parallel "/^dev:.*/"
```

## LICENSE

This project is under the GPL V3 LICENSE.

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FPeng-YM%2FSub-Store?ref=badge_large)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=sub-store-org/sub-store&type=Date)](https://star-history.com/#sub-store-org/sub-store&Date)

## Acknowledgements

- Special thanks to @KOP-XIAO for his awesome resource-parser. Please give a [star](https://github.com/KOP-XIAO/QuantumultX) for his great work!
- Special thanks to @Orz-3 and @58xinian for their awesome icons.
