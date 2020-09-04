function operator(proxies) {
    const counter = {};
    return proxies.map(p => {
      if (!counter[p.name]) counter[p.name] = 0;
      p.name = p.name + " " + (++counter[p.name]).toString();
      return p;
    });
}