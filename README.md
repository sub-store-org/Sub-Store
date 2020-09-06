# Sub-Store
> This project is still under active development.

Subscription manager for QX, Loon and Surge.

Core functionalities:
1. Conversion among various formats.
2. Subscription formatting.
3. Collect multiple subscriptions in one URL.
## 1. Subscription Conversion
### Supported Input Formats
- [x] SS URI
- [x] SSR URI
- [x] SSD URI
- [x] V2RayN URI
- [x] QX (SS, SSR, VMess, Trojan, HTTP)
- [x] Loon (SS, SSR, VMess, Trojan, HTTP)
- [x] Surge (SS, VMess, Trojan, HTTP)
- [x] Clash (SS, SSR, VMess, Trojan, HTTP)

### Supported Target Platforms
- [x] QX
- [x] Loon
- [x] Surge

## 2. Subscription Formatting
### Filtering
- [x] **Keyword filter**
- [x] **Discard keywords filter**
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
- [x] **Keyword sort operator**: sort proxies by keywords (fallback to normal sort).
- [x] **Keyword rename operator**: replace by keywords in proxy names.
- [x] **Keyword delete operator**: delete by keywords in proxy names.
- [x] **Regex rename operator**: replace by regex in proxy names.
- [x] **Regex delete operator**: delete by regex in proxy names.
- [x] **Script operator**: modify proxy by script.

### Development
Go to `backend` and `web` directories, install node dependencies:
```
npm install
```

1. In `backend`, run the backend server on http://localhost:3000

```
node sub-store.js
```

2. In`web`, start the vue-cli server
```
npm start
```

## LICENSE
This project is under the GPL V3 LICENSE.

## Acknowledgements
Special thanks to @KOP-XIAO for his awesome resource-parser. Please give a [star](https://github.com/KOP-XIAO/QuantumultX) for his great work!
