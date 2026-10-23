/* 건축설비 자율화 연구실 홈페이지 v3 — 공통 상단 메뉴·하단 풋터 생성
   (메뉴·주소·이메일·태그라인을 바꾸려면 아래 상수만 고치면 모든 페이지에 반영됩니다) */
(function () {
  var EMAIL = "juhongoh@pknu.ac.kr";                   // 부경대 계정 (2026-10-10 반영)
  var ORCID = "https://orcid.org/0000-0002-8324-1912";
  var ADDRESS = "부산광역시 남구 용소로 45 국립부경대학교 건축공학과<br>건축관 8424호";   // <br> = 풋터에서 줄바꿈
  var NAME_KO = "건축설비 자율화 연구실";
  var NAME_EN = "Autonomous Building Systems Research Group";
  var TAGLINE_KO = "자동화에서 자율화로, 물리와 데이터가 융합된 지능형 운영";
  var HOME_PAGE = "index.html";
  var LOGO_SYMBOL = "assets/img/연구실 로고 심볼.png";
  var PAGES = [
    { id: "research",     href: "research.html",     label: "Research" },
    { id: "projects",     href: "projects.html",     label: "Projects" },
    { id: "publications", href: "publications.html", label: "Publications" },
    { id: "group", label: "Team", children: [
      { id: "professor", href: "professor.html", label: "Professor" },
      { id: "members", href: "members.html", label: "Members" }
    ] }
  ];

  var cur = document.body.getAttribute("data-page") || "";
  var mark = '<img class="brand__logo" src="' + LOGO_SYMBOL + '" width="1774" height="887" alt="">' +
             '<span class="brand__wordmark" lang="en">' +
             NAME_EN.replace(' Research Group', ' <span class="brand__group">Research Group</span>') +
             '</span>';

  var links = PAGES.map(function (p) {
    if (p.children) {
      var groupActive = cur === "people" || p.children.some(function (child) { return child.id === cur; });
      var children = p.children.map(function (child) {
        var current = child.id === cur ? ' class="is-active" aria-current="page"' : "";
        return '<a href="' + child.href + '"' + current + '>' + child.label + '</a>';
      }).join("");
      return '<details class="nav__group"><summary' + (groupActive ? ' class="is-active"' : '') + '>' +
        p.label + '</summary><div class="nav__submenu">' + children + '</div></details>';
    }
    var active = p.id === cur ? ' class="is-active" aria-current="page"' : "";
    return '<a href="' + p.href + '"' + active + ">" + p.label + "</a>";
  }).join("");

  var nav =
    '<header class="nav"><div class="wrap nav__in">' +
      '<a class="brand" href="' + HOME_PAGE + '">' + mark + '</a>' +
      '<nav class="nav__links" aria-label="주 메뉴">' + links +
        '<a class="nav__mail" href="mailto:' + EMAIL + '">Contact</a></nav>' +
    "</div></header>";

  var footer =
    '<footer class="footer"><div class="wrap">' +
      '<div class="footer__grid">' +
        '<div><span class="brand__name" lang="en">' + NAME_EN + '</span>' +
          '<p>' +
          '<span class="small muted">' + TAGLINE_KO + '</span></p></div>' +
        '<div><span class="kicker">Contact</span>' +
          '<p>' + ADDRESS + '<br><a href="mailto:' + EMAIL + '">' + EMAIL + "</a></p></div>" +
        '<div><span class="kicker">Links</span>' +
          '<p><a href="' + ORCID + '" target="_blank" rel="noopener">ORCID 0000-0002-8324-1912</a><br>' +
          '<a href="publications.html">Publications</a><br>' +
          '<a href="members.html#join">학생 모집 안내</a></p></div>' +
      "</div>" +
      '<div class="footer__bottom"><span>© 2026 ' + NAME_EN + ' · Pukyong National University</span></div>' +
    "</div></footer>";

  var n = document.getElementById("site-nav");
  var f = document.getElementById("site-footer");
  if (n) n.outerHTML = nav;
  if (f) f.outerHTML = footer;

  var groupNav = document.getElementById("site-group-nav");
  if (groupNav) {
    var groupPages = PAGES.filter(function (p) { return p.id === "group"; })[0].children;
    groupNav.outerHTML = '<nav class="group-nav" aria-label="연구실 소개 하위 메뉴">' +
      groupPages.map(function (p) {
        return '<a href="' + p.href + '"' + (p.id === cur ? ' aria-current="page"' : '') + '>' + p.label + '</a>';
      }).join("") + '</nav>';
  }

  var groupMenu = document.querySelector(".nav__group");
  if (groupMenu) {
    document.addEventListener("click", function (event) {
      if (!groupMenu.contains(event.target)) groupMenu.open = false;
    });
    document.addEventListener("focusin", function (event) {
      if (!groupMenu.contains(event.target)) groupMenu.open = false;
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && groupMenu.open) {
        groupMenu.open = false;
        groupMenu.querySelector("summary").focus();
      }
    });
  }
})();
