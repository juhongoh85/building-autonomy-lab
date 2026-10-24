/* 건축설비 자율화 연구실 홈페이지 v3 — 공통 상단 메뉴·하단 풋터 생성
   (메뉴·주소·이메일·태그라인을 바꾸려면 아래 상수만 고치면 모든 페이지에 반영됩니다)

   한글판(루트)과 영문판(en/ 폴더)이 이 파일 하나를 같이 씁니다.
   - <html lang="en"> 이면 영문 문구(주소·태그라인·버튼 글자)를 씁니다.
   - 로고 같은 공용 파일의 경로 앞머리(ROOT)는 <script src="../assets/site.js"> 의 상대경로에서 알아냅니다.
     루트 페이지는 "" , en/ 페이지는 "../" 가 됩니다.
   - 상단 메뉴 맨 오른쪽에 언어 전환 링크(English ↔ 한국어)가 붙습니다. 같은 페이지의 다른 언어판으로 갑니다. */
(function () {
  var EMAIL = "juhongoh@pknu.ac.kr";                   // 부경대 계정 (2026-10-10 반영)
  var ORCID = "https://orcid.org/0000-0002-8324-1912";
  var ADDRESS_KO = "부산광역시 남구 용소로 45 국립부경대학교 건축공학과<br>건축관 8424호";   // <br> = 풋터에서 줄바꿈
  var ADDRESS_EN = "Department of Architectural Engineering, Pukyong National University<br>Room 8424, Architecture Building<br>45 <span style=\"white-space:nowrap\">Yongso-ro</span>, <span style=\"white-space:nowrap\">Nam-gu</span>, Busan 48513, Republic of Korea";   // 하이픈에서 줄이 끊기지 않게 nowrap
  var NAME_KO = "건축설비 자율화 연구실";
  var NAME_EN = "Autonomous Building Systems Research Group";
  var TAGLINE_KO = "자동화에서 자율화로, 물리와 데이터가 융합된 지능형 운영";
  var TAGLINE_EN = "From automation to autonomy: intelligent operation that unites physics and data";
  var HOME_PAGE = "index.html";      // 한글판 홈. sync_deploy.py 가 배포 때 index.html 로 바꿉니다
  var HOME_PAGE_EN = "index.html";            // 영문판 홈 (en/ 폴더 안)
  var PAGES = [
    { id: "research",     href: "research.html",     label: "Research" },
    { id: "projects",     href: "projects.html",     label: "Projects" },
    { id: "publications", href: "publications.html", label: "Publications" },
    { id: "group", label: "Team", children: [
      { id: "professor", href: "professor.html", label: "Professor" },
      { id: "members", href: "members.html", label: "Members" }
    ] }
  ];

  /* 언어와 경로 앞머리 */
  var LANG = (document.documentElement.getAttribute("lang") || "ko").toLowerCase().indexOf("en") === 0 ? "en" : "ko";
  var scriptTag = document.querySelector('script[src$="site.js"]');
  var ROOT = scriptTag ? scriptTag.getAttribute("src").replace(/assets\/site\.js$/, "") : "";
  var LOGO_SYMBOL = ROOT + "assets/img/연구실 로고 심볼.png";
  var homeHref = LANG === "en" ? HOME_PAGE_EN : HOME_PAGE;

  /* 언어별 문구 */
  var T;
  if (LANG === "en") {
    T = {
      navLabel: "Main menu",
      groupNavLabel: "Team submenu",
      tagline: TAGLINE_EN,
      address: ADDRESS_EN,
      join: "Prospective Students",
      langSwitch: "한국어",
      langSwitchLang: "ko",
      zoomLabel: "Enlarge figure",
      zoomClose: "Close ×"
    };
  } else {
    T = {
      navLabel: "주 메뉴",
      groupNavLabel: "연구실 소개 하위 메뉴",
      tagline: TAGLINE_KO,
      address: ADDRESS_KO,
      join: "학생 모집 안내",
      langSwitch: "English",
      langSwitchLang: "en",
      zoomLabel: "그림 확대",
      zoomClose: "닫기 ×"
    };
  }

  var cur = document.body.getAttribute("data-page") || "";

  /* 언어 전환 링크: 같은 페이지의 다른 언어판. 홈은 파일명이 달라 따로 처리 */
  function hrefOf(id) {
    var found = null;
    PAGES.forEach(function (p) {
      if (p.id === id) found = p.href;
      if (p.children) {
        p.children.forEach(function (child) { if (child.id === id) found = child.href; });
      }
    });
    return found;
  }
  var sameFile = hrefOf(cur);
  var langHref;
  if (LANG === "en") {
    langHref = ROOT + (sameFile || HOME_PAGE);          // en/ → 루트(한글판)
  } else {
    langHref = "en/" + (sameFile || HOME_PAGE_EN);      // 루트 → en/(영문판)
  }
  langHref += window.location.hash || "";

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
      '<a class="brand" href="' + homeHref + '">' + mark + '</a>' +
      '<nav class="nav__links" aria-label="' + T.navLabel + '">' + links +
        '<a class="nav__mail" href="mailto:' + EMAIL + '">Contact</a>' +
        '<a class="nav__lang" href="' + langHref + '" lang="' + T.langSwitchLang + '" hreflang="' + T.langSwitchLang + '">' + T.langSwitch + '</a>' +
      '</nav>' +
    "</div></header>";

  var footer =
    '<footer class="footer"><div class="wrap">' +
      '<div class="footer__grid">' +
        '<div><span class="brand__name" lang="en">' + NAME_EN + '</span>' +
          '<p>' +
          '<span class="small muted">' + T.tagline + '</span></p></div>' +
        '<div><span class="kicker">Contact</span>' +
          '<p>' + T.address + '<br><a href="mailto:' + EMAIL + '">' + EMAIL + "</a></p></div>" +
        '<div><span class="kicker">Links</span>' +
          '<p><a href="' + ORCID + '" target="_blank" rel="noopener">ORCID 0000-0002-8324-1912</a><br>' +
          '<a href="publications.html">Publications</a><br>' +
          '<a href="members.html#join">' + T.join + '</a></p></div>' +
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
    groupNav.outerHTML = '<nav class="group-nav" aria-label="' + T.groupNavLabel + '">' +
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

  /* 그림 클릭 확대 — Research·Projects 의 <figure class="fig"> 그림.
     클릭(또는 Enter)하면 화면 가득 보여주고, 아무 곳이나 클릭·Esc·닫기 로 돌아옵니다. 홈의 비전 그림은 대상이 아닙니다. */
  if (cur === "research" || cur === "projects") {
    var zoomables = document.querySelectorAll("main .fig img");
    if (zoomables.length) {
      var zoom = document.createElement("div");
      zoom.className = "zoom";
      zoom.setAttribute("role", "dialog");
      zoom.setAttribute("aria-modal", "true");
      zoom.setAttribute("aria-label", T.zoomLabel);
      zoom.hidden = true;
      zoom.innerHTML = '<button class="zoom__close" type="button">' + T.zoomClose + '</button>' +
                       '<img class="zoom__img" alt="">' +
                       '<p class="zoom__cap"></p>';
      document.body.appendChild(zoom);
      var zoomImg = zoom.querySelector(".zoom__img");
      var zoomCap = zoom.querySelector(".zoom__cap");
      var zoomClose = zoom.querySelector(".zoom__close");
      var zoomFrom = null;

      function openZoom(img) {
        var fig = img.closest("figure");
        var cap = fig ? fig.querySelector("figcaption") : null;
        zoomImg.src = img.currentSrc || img.src;
        zoomImg.alt = img.alt || "";
        zoomCap.textContent = cap ? cap.textContent : (img.alt || "");
        zoomCap.hidden = !zoomCap.textContent;
        zoom.hidden = false;
        document.body.classList.add("is-zoomed");
        zoomFrom = img;
        zoomClose.focus();
      }
      function closeZoom() {
        zoom.hidden = true;
        document.body.classList.remove("is-zoomed");
        zoomImg.removeAttribute("src");
        if (zoomFrom) zoomFrom.focus();
        zoomFrom = null;
      }

      Array.prototype.forEach.call(zoomables, function (img) {
        img.classList.add("is-zoomable");
        img.setAttribute("tabindex", "0");
        img.setAttribute("role", "button");
        img.addEventListener("click", function () {
          if (!img.closest(".is-missing")) openZoom(img);
        });
        img.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!img.closest(".is-missing")) openZoom(img);
          }
        });
      });
      zoom.addEventListener("click", closeZoom);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !zoom.hidden) closeZoom();
      });
    }
  }
})();
