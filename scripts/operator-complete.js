function operator(proxies) {
  let procedure;
  // useless proxies filter
  procedure = $get("Useless Filter");
  proxies = $process(procedure, proxies);

  // region filter
  procedure = $get("Region Filter", ["HK", "TW", "US", "SG", "JP"]);
  proxies = $process(procedure, proxies);

  // keyword filter
  procedure = $get("Keyword Filter", {
    keywords: ["IPLC", "IEPL"],
    keep: true,
  });
  proxies = $process(procedure, proxies);

  // regex filter
  procedure = $get("Regex Filter", {
    regex: ["^.*港.*NF$", "^.*新.*NF$"],
    keep: true,
  });
  proxies = $process(procedure, proxies);

  // type filter
  procedure = $get("Type Filter", ["Trojan"])
  proxies = $process(procedure, proxies);

  // set property operator
  procedure = $get("Set Property Operator", {
      "key": "scert",
      "value": "false"
  });
  proxies = $process(procedure, proxies);

  // sort operator
  procedure = $get("Sort Operator", "asc"); // asc, desc, random
  proxies = $process(procedure, proxies);

  // keyword sort operator
  procedure = $get("Keyword Sort Operator", ["HK", "JP", "SG"]);
  proxies = $process(procedure, proxies);

  // keyword rename operator
  procedure = $get("Keyword Rename Operator", [
      { old: "A", now: "B" },
      { old: "C", now: "D"}
  ]);
  proxies = $process(procedure, proxies);

  // keyword delete operator
  procedure = $get("Keyword Delete Operator", ["A", "B", "C"]);
  proxies = $process(procedure, proxies);

  // regex rename operator
  procedure = $get("Regex Rename Operator", [
    { expr: "A", now: "B" },
    { expr: "C", now: "D"}
  ])
  proxies = $process(procedure, proxies);

  // regex delete operator
  procedure = $get("Regex Delete Operator", ["A", "B", "C"]);
  proxies = $process(procedure, proxies);

  // flag operator
  procedure = $get("Flag Operator", true);
  proxies = $process(procedure, proxies);
  return proxies;
}
