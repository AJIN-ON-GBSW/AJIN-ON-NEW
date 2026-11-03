// React implementation of the supplied AJIN ON screen; source layout and business calculations preserved.
import React from "react";
import {PageComponent,styleObject} from "../runtime/PageComponent.jsx";

export default class IATF extends PageComponent {
  constructor(props) {
    super(props);
    this.state = { admin: true, certOpen: null, org: '아진산업', start: 2024, site: '전체', kind: '전체', open: -1 };
    // [키, 사업장, 소속]
    this.SITES = [
      ['hq', '본사 · 경산', '아진산업'], ['geoncheon', '건천', '아진카인텍'], ['mohwa', '모화', '아진카인텍'],
      ['ajajin', 'AJ아진', 'AJ아진'], ['wooshin', '우신산업', '우신산업'], ['elec', '아진전자', '아진전자'],
      ['ajinusa', '아진USA', '아진USA'], ['wooshinusa', '우신USA', '우신USA'], ['georgia', '준조지아', '준조지아']
    ];
    // 법인 → 사업장 (문자열 = 현재 인증 없음)
    this.ORGS = [
      ['아진산업', ['hq', '구어', '입실', '준텍']], ['아진카인텍', ['geoncheon', 'mohwa']], ['AJ아진', ['ajajin']], ['우신산업', ['wooshin']],
      ['아진전자', ['elec']], ['아진USA', ['ajinusa']], ['우신USA', ['wooshinusa']], ['준조지아', ['georgia']]
    ];
    // [사업장키, 구분, 1단계일, 시작일, 종료일] · 날짜를 모르면 연도만 ('2027')
    this.AUDITS = [
      ['hq', '갱신', '', '2024-07-15', '2024-07-17'], ['hq', '사후1차', '', '2025-08-26', '2025-08-27'], ['hq', '사후2차', '', '2026-07-06', '2026-07-07'], ['hq', '갱신', '', '2027', '2027'],
      ['geoncheon', '최초', '2024-02-05', '2024-02-26', '2024-02-29'], ['geoncheon', '사후1차', '', '2025-02-17', '2025-02-18'], ['geoncheon', '사후2차', '', '2026-02-02', '2026-02-03'], ['geoncheon', '갱신', '', '2027-02-22', '2027-02-24'],
      ['mohwa', '최초', '2025', '2025-02-19', '2025-02-21'], ['mohwa', '사후1차', '', '2026-02-04', '2026-02-06'], ['mohwa', '사후2차', '', '2027-02-25', '2027-02-26'],
      ['ajajin', '갱신', '', '2023-09-11', '2023-09-12'], ['ajajin', '사후2차', '', '2025-11-26', '2025-11-27'], ['ajajin', '갱신', '', '2026-07-23', '2026-07-24'],
      ['wooshin', '사후1차', '', '2022-07-18', '2022-07-19'], ['wooshin', '갱신', '', '2024-07-17', '2024-07-18'], ['wooshin', '사후1차', '', '2025-08-28', '2025-08-29'], ['wooshin', '사후2차', '', '2026-07-08', '2026-07-09'],
      ['elec', '사후2차', '', '2026-03-16', '2026-03-17'],
      ['ajinusa', '갱신', '', '2024-06-10', '2024-06-13'], ['ajinusa', '사후1차', '', '2025-06-23', '2025-06-25'], ['ajinusa', '사후2차', '', '2026-05-26', '2026-05-28'],
      ['wooshinusa', '갱신', '', '2024-06-18', '2024-06-21'], ['wooshinusa', '사후1차', '', '2025-06-26', '2025-06-27'], ['wooshinusa', '사후2차', '', '2026-06-04', '2026-06-05'],
      ['georgia', '최초', '2025-11-19', '2025-12-15', '2025-12-19']
    ];
    // 엑셀에 비어 있어 확인이 필요한 칸
    this.MISSING = [['ajajin', 2024, '사후1차'], ['wooshin', 2023, '사후2차'], ['elec', 2024, '갱신'], ['elec', 2025, '사후1차']];
  }
  renderVals() {
    var self = this, st = this.state;
    var d0 = new Date();
    var today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
    var NEXT = { '최초': '사후1차', '갱신': '사후1차', '사후1차': '사후2차', '사후2차': '갱신' };
    var siteOf = {}; this.SITES.forEach(function (s) { siteOf[s[0]] = s; });
    var exact = function (d) { return d.length === 10; };
    var sk = function (d) { return exact(d) ? d : d + '-99'; };
    var dot = function (d) { return d.replace(/-/g, '.'); };
    var days = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1; };
    var dday = function (d) { var n = Math.round((Date.parse(d) - Date.parse(today)) / 86400000); return n === 0 ? 'D-DAY' : n > 0 ? 'D-' + n : 'D+' + (-n); };

    // 사업장별 다음 심사 (기록에 있으면 그대로, 없으면 마지막 심사 +1년 예측)
    var shift = function (d, years, dayAdj) { var t = new Date(Date.UTC(Number(d.slice(0, 4)) + years, Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + (dayAdj || 0))); return t.toISOString().slice(0, 10); };
    var nextOf = {};
    this.SITES.forEach(function (s) {
      var list = self.AUDITS.filter(function (a) { return a[0] === s[0]; });
      var fut = list.filter(function (a) { return !exact(a[3]) || a[3] >= today; }).sort(function (a, b) { return sk(a[3]) < sk(b[3]) ? -1 : 1; })[0];
      var past = list.filter(function (a) { return exact(a[3]) && a[3] < today; });
      var last = past[past.length - 1];
      var cyc = past.filter(function (a) { return a[1] === '갱신' || a[1] === '최초'; }).pop();
      var expiry = cyc ? shift(cyc[3], 3, -1) : '';
      var n = null;
      if (fut) {
        var due = fut[1] === '갱신' ? expiry : (last ? shift(last[3], 1) : '');
        n = { kind: fut[1], start: fut[3], end: fut[4], ghost: false, exact: exact(fut[3]), due: due, over: exact(fut[3]) && due && fut[3] > due };
      } else if (last) {
        var k = NEXT[last[1]];
        var d2 = k === '갱신' && expiry ? expiry : shift(last[3], 1);
        n = { kind: k, start: d2, end: '', ghost: true, exact: false, due: d2, over: false };
      }
      if (n) { n.cycle = cyc; n.expiry = expiry; nextOf[s[0]] = n; }
    });
    var kindColor = function (k) { return k === '갱신' || k === '최초' ? ['#0b2343', '#e8eef8'] : k === '사후1차' ? ['#1d4ed8', '#e8f0fe'] : ['#7a3fc0', '#f3e8ff']; };
    var kindStyle = function (k) { var c = kindColor(k); return 'justify-self: start; font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; color: ' + c[0] + '; background: ' + c[1]; };
    var whenText = function (n) {
      if (n.exact) return dot(n.start) + (n.end && n.end !== n.start ? ' ~ ' + n.end.slice(5).replace('-', '.') : '') + (n.over ? (n.kind === '갱신' ? ' · 인증 만료일 초과!' : ' · 직전 심사 +1년 넘음, 확인') : '');
      if (n.ghost) return '일정 미등록 · 기한 ' + dot(n.due) + (n.kind === '갱신' ? (n.expiry ? ' (인증 만료 전)' : ' (주기 시작일 확인 필요)') : '');
      return n.start + '년 날짜 미정' + (n.due ? ' · 기한 ' + dot(n.due) : '');
    };
    var refDate = function (n) { return n.exact ? n.start : n.due; };
    var ddayText = function (n) { var r = refDate(n); return r ? (n.exact ? '' : '기한 ') + dday(r) : '미정'; };
    var ddayStyle = function (n) {
      var r = refDate(n), c = '#66758a';
      if (r) { var k = (Date.parse(r) - Date.parse(today)) / 86400000; c = n.over || k <= 60 ? '#c23b3b' : k <= 120 ? '#c77a12' : '#1d4ed8'; }
      return 'font-size: 12px; color: ' + c;
    };
    var pill = function (bg, fg) { return 'justify-self: start; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 4px 10px; background: ' + bg + '; color: ' + fg; };
    var urg = function (n) {
      var r = n ? refDate(n) : '';
      if (!r) return { c: '#66758a', bg: '#f0f2f5', label: '미정', days: 99999 };
      var k = Math.round((Date.parse(r) - Date.parse(today)) / 86400000);
      if (n.over || k <= 60) return { c: '#ffffff', bg: '#c23b3b', label: dday(r), days: k };
      if (k <= 120) return { c: '#ffffff', bg: '#c77a12', label: dday(r), days: k };
      return { c: '#1d4ed8', bg: '#e8f0fe', label: dday(r), days: k };
    };
    var COLS = 'grid-template-columns: 6px 150px 90px 92px minmax(0, 1.3fr) minmax(0, 1fr) 84px 18px';
    var SCOLS = 'grid-template-columns: 130px 100px 92px minmax(0, 1.3fr) minmax(0, 1fr) 84px';
    var describe = function (n) {
      var u = urg(n);
      var sched, schedStyle;
      if (!n) { sched = '-'; schedStyle = 'color: #a3adba'; }
      else if (n.exact) { sched = dot(n.start) + (n.end && n.end !== n.start ? ' ~ ' + n.end.slice(5).replace('-', '.') : ''); schedStyle = 'font-weight: 700; color: #141a23'; }
      else if (n.ghost) { sched = '일정 미등록'; schedStyle = 'justify-self: start; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 3px 9px; background: #fff7ea; color: #a35f12; border: 1px dashed #e0b06a'; }
      else { sched = n.start + '년 · 날짜 미정'; schedStyle = 'justify-self: start; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 3px 9px; background: #fff7ea; color: #a35f12; border: 1px dashed #e0b06a'; }
      var due = !n ? '-' : !n.due ? '[주기 시작일 확인 필요]' : (n.kind === '갱신' ? '인증 만료 ' : '1년 기한 ') + dot(n.due);
      if (n && n.over) due += ' · 초과!';
      if (n && n.kind === '갱신' && !n.expiry) due += ' (추정)';
      return {
        kind: n ? n.kind : '-', kindStyle: n ? kindStyle(n.kind) : 'color: #a3adba',
        sched: sched, schedStyle: schedStyle, due: due, dueStyle: 'font-size: 12px; color: ' + (n && n.over ? '#c23b3b; font-weight: 700' : '#4a5566'),
        dday: u.label, ddayStyle: 'justify-self: end; font-size: 13px; font-weight: 900; border-radius: 10px; padding: 5px 10px; min-width: 64px; text-align: center; background: ' + u.bg + '; color: ' + u.c,
        stripe: 'align-self: stretch; border-radius: 3px; background: ' + (u.days <= 60 ? '#c23b3b' : u.days <= 120 ? '#c77a12' : u.days < 99999 ? '#9db8ea' : '#d5dbe4'),
        u: u
      };
    };
    var siteRow = function (k) {
      var base = 'display: grid; ' + SCOLS + '; gap: 12px; align-items: center; border-radius: 10px; padding: 10px 12px; font-size: 13px; ';
      if (!siteOf[k]) return { site: k, sub: '', status: '인증 없음', statusStyle: 'justify-self: start; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 3px 9px; background: #f0f2f5; color: #66758a', kind: '-', kindStyle: 'color: #a3adba', sched: '-', schedStyle: 'color: #a3adba', due: '', dueStyle: '', dday: '', ddayStyle: 'display: none', rowStyle: base + 'background: #f5f7fa; border: 1px dashed #d5dbe4; color: #66758a' };
      var n = nextOf[k], d = describe(n);
      return Object.assign(d, {
        site: siteOf[k][1], sub: k === 'hq' ? '한 인증으로 함께 심사' : (n && n.cycle ? '주기 ' + dot(n.cycle[3]) + ' ' + n.cycle[1] : '주기 시작일 확인 필요'),
        status: '인증 유지', statusStyle: 'justify-self: start; font-size: 12px; font-weight: 700; border-radius: 8px; padding: 3px 9px; background: #e7f5ee; color: #1f7a55',
        rowStyle: base + 'background: #ffffff; border: 1px solid #e3e8ef'
      });
    };
    var orgCards = this.ORGS.map(function (o) {
      var certified = o[1].filter(function (k) { return siteOf[k]; });
      var hq = o[1].indexOf('hq') >= 0 ? 1 : 0;
      var nexts = certified.map(function (k) { return nextOf[k]; }).filter(Boolean).sort(function (a, b) { return urg(a).days - urg(b).days; });
      var n = nexts[0], on = st.org === o[0], d = describe(n);
      return Object.assign(d, {
        name: o[0], certCount: (certified.length + hq) + ' / ' + (o[1].length + hq), caret: on ? '▲' : '▼', expanded: on ? 'true' : 'false', open: on,
        sites: on ? o[1].map(siteRow) : [],
        pick: function () { self.setState({ org: on ? null : o[0] }); },
        style: 'display: grid; ' + COLS + '; gap: 12px; align-items: center; width: 100%; text-align: left; font: inherit; font-size: 13px; color: #141a23; cursor: pointer; border-radius: 12px; padding: 12px 16px 12px 10px; background: ' + (on ? '#f3f7ff' : '#ffffff') + '; border: ' + (on ? '2px solid #1d4ed8' : '1px solid #e3e8ef')
      });
    }).sort(function (a, b) { return a.u.days - b.u.days; });
    var simpleWhen = function (n) {
      if (!n) return '';
      if (n.exact) return dot(n.start) + (n.end && n.end !== n.start ? ' ~ ' + n.end.slice(5).replace('-', '.') : '');
      return n.due ? dot(n.due) + '까지' : '날짜 미정';
    };
    var simpleCards = this.ORGS.map(function (o) {
      var certified = o[1].filter(function (k) { return siteOf[k]; });
      var nexts = certified.map(function (k) { return nextOf[k]; }).filter(Boolean).sort(function (a, b) { return urg(a).days - urg(b).days; });
      var n = nexts[0], u = urg(n);
      var tone = u.days <= 60 ? '#c23b3b' : u.days <= 120 ? '#c77a12' : '#1d4ed8';
      return {
        name: o[0], days: u.days, dday: n ? u.label : '-', kind: n ? n.kind : '',
        when: simpleWhen(n), fixed: n && n.exact ? '날짜 확정' : '날짜 미정',
        fixedStyle: 'font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; ' + (n && n.exact ? 'background: #e8f0fe; color: #1d4ed8' : 'background: #f0f2f5; color: #66758a'),
        ddayStyle: 'font-size: 28px; font-weight: 900; letter-spacing: -0.02em; color: ' + tone,
        style: 'border: 1px solid #e3e8ef; border-top: 4px solid ' + tone + '; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; background: #ffffff',
        multi: o[1].length > 1,
        sites: o[1].map(function (k) {
          var sn = nextOf[k], su = urg(sn);
          if (!siteOf[k]) return { name: k, text: '인증 없음', style: 'display: flex; justify-content: space-between; font-size: 12px; color: #a3adba' };
          return { name: siteOf[k][1], text: sn ? sn.kind + ' · ' + su.label : '-', style: 'display: flex; justify-content: space-between; font-size: 12px; color: #2b3644' };
        })
      };
    }).sort(function (a, b) { return a.days - b.days; });
    var CERT = [
      ['아진산업', [['본사', 1, ''], ['경산', 1, '본사와 같은 인증서'], ['구어', 0], ['입실', 0], ['준텍', 0]]],
      ['아진카인텍', [['건천', 1, ''], ['모화', 1, '']]],
      ['AJ아진', [['AJ아진', 1, '']]], ['우신산업', [['우신산업', 1, '']]], ['아진전자', [['아진전자', 1, '']]],
      ['아진USA', [['아진USA', 1, '']]], ['우신USA', [['우신USA', 1, '']]], ['준조지아', [['준조지아', 1, '']]]
    ];
    var certRows = [];
    CERT.forEach(function (o, oi) {
      o[1].forEach(function (p, pi) {
        certRows.push({
          org: pi === 0 ? o[0] : '', plant: p[0], has: p[1] ? '취득' : '없음', no: p[1] ? '[인증서 번호]' : '-', note: p[2] || '',
          rowStyle: 'display: grid; grid-template-columns: 160px 140px 90px minmax(0, 1fr); gap: 12px; padding: 11px 16px; font-size: 14px; align-items: center; border-top: ' + (pi === 0 && oi > 0 ? '1px solid #d5dbe4' : pi === 0 ? '0' : '1px solid #f0f2f5') + '; color: ' + (p[1] ? '#141a23' : '#8a96a6')
        });
      });
    });
    var certCards = CERT.map(function (o) {
      var got = o[1].filter(function (p) { return p[1]; }).length, multi = o[1].length > 1, open = st.certOpen === o[0];
      return {
        name: o[0], multi: multi, single: !multi, open: multi && open,
        summary: multi ? '사업장 ' + o[1].length + '곳 · 인증 ' + got + '곳' : '인증 취득',
        no: multi ? '' : '[인증서 번호]',
        toggleLabel: open ? '사업장 접기 ▲' : '사업장 보기 ▼',
        toggle: function () { self.setState({ certOpen: open ? null : o[0] }); },
        plants: o[1].map(function (p) {
          return { name: p[0], text: p[1] ? '[인증서 번호]' + (p[2] ? ' · ' + p[2] : '') : '인증 없음', style: 'display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; font-size: 13px; background: #f5f7fa; color: ' + (p[1] ? '#141a23' : '#8a96a6') };
        }),
        style: 'border: 1px solid ' + (open ? '#0b2343' : '#e3e8ef') + '; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 8px; background: #ffffff; min-height: 120px'
      };
    });
    var allN = this.SITES.map(function (s) { return nextOf[s[0]]; }).filter(Boolean);
    var kpi = function (label, value, sub, color) { return { label: label, value: value, sub: sub, style: 'border-radius: 12px; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; background: ' + color[0] + '; color: ' + color[1] }; };
    var certKpis = [
      kpi('인증 사업장', '10 / 13', '구어 · 입실 · 준텍 인증 없음', ['#f5f7fa', '#141a23']),
      kpi('60일 안에 기한', allN.filter(function (n) { return urg(n).days <= 60; }).length + '곳', '빨간색 · 지금 챙겨야 할 곳', ['#fdecec', '#c23b3b']),
      kpi('일정 미등록', allN.filter(function (n) { return !n.exact; }).length + '곳', '기한만 있고 날짜가 없음', ['#fff7ea', '#a35f12']),
      kpi('날짜 확정', allN.filter(function (n) { return n.exact; }).length + '곳', '다음 심사 날짜가 잡힘', ['#e8f0fe', '#1d4ed8'])
    ];

    var years = [];
    for (var y = st.start; y < st.start + 5; y++) years.push(y);
    var thisYear = d0.getFullYear();
    // 인증 주기(3년) 띠: 갱신/최초일부터 3년 - 1일까지
    var CYC_COLORS = ['#0b2343', '#1f6f8b'];
    var cyclesOf = function (key) {
      var list = self.AUDITS.filter(function (a) { return a[0] === key; }).sort(function (a, b) { return sk(a[3]) < sk(b[3]) ? -1 : 1; });
      var out = [];
      list.forEach(function (a, i) {
        if (a[1] === '갱신' || a[1] === '최초') {
          if (exact(a[3])) out.push({ start: a[3], end: shift(a[3], 3, -1), kind: a[1], planned: a[3] >= today, inferred: false });
          else out.push({ start: a[3] + '-01-01', end: '', kind: a[1], planned: true, inferred: false, yearOnly: true });
        } else if (i === 0 && exact(a[3])) {
          var back = a[1] === '사후1차' ? 1 : 2;
          var y0 = Number(a[3].slice(0, 4)) - back;
          out.push({ start: y0 + a[3].slice(4), end: shift(y0 + a[3].slice(4), 3, -1), kind: '갱신', planned: false, inferred: true });
        }
      });
      var n = nextOf[key];
      if (n && n.ghost && n.kind === '갱신') out.push({ start: n.due, end: '', kind: '갱신', planned: true, inferred: false, ghost: true });
      return out;
    };
    var winStart = years[0], winEnd = years[4];
    var gridRows = this.SITES.map(function (s) {
      return {
        site: s[1], org: s[2] === s[1] ? '' : s[2],
        bars: cyclesOf(s[0]).map(function (c, ci) {
          var y1 = Number(c.start.slice(0, 4)), y2 = y1 + 2;
          if (y2 < winStart || y1 > winEnd) return null;
          var a = Math.max(y1, winStart), b = Math.min(y2, winEnd);
          var soft = c.inferred || c.planned;
          var col = CYC_COLORS[ci % 2];
          var label = c.inferred ? '이전 주기 (추정)' : c.planned ? (c.ghost ? '다음 주기 · 갱신 후 시작' : '다음 주기 (' + c.kind + ' 예정)') : c.kind + ' 주기 · 3년';
          var range = c.yearOnly ? ' ' + y1 + '년 시작 예정' : c.ghost ? ' 기한 ' + dot(c.start) + ' 전 갱신' : ' ' + dot(c.start) + ' → 만료 ' + dot(c.end);
          return {
            label: label, range: range, title: label + range,
            style: 'grid-row: 1; grid-column: ' + (a - winStart + 2) + ' / ' + (b - winStart + 3) + '; margin: 8px 8px 0; height: 22px; display: flex; align-items: center; gap: 8px; padding: 0 10px; font-size: 11px; white-space: nowrap; overflow: hidden; color: ' + (soft ? '#2b3644' : '#ffffff') + '; background: ' + (soft ? 'repeating-linear-gradient(135deg, #d9e0ea 0 6px, #eef1f6 6px 12px)' : col) + '; border-radius: ' + (y1 < winStart ? '0' : '11px') + ' ' + (y2 > winEnd ? '0 0' : '11px 11px') + ' ' + (y1 < winStart ? '0' : '11px')
          };
        }).filter(Boolean),
        cells: years.map(function (yr) {
          var a = self.AUDITS.filter(function (x) { return x[0] === s[0] && x[3].slice(0, 4) === String(yr); })[0];
          var miss = self.MISSING.filter(function (x) { return x[0] === s[0] && x[1] === yr; })[0];
          var n = nextOf[s[0]];
          var ghost = !a && n && n.ghost && n.start.slice(0, 4) === String(yr);
          var wrap = 'grid-row: 2; grid-column: ' + (years.indexOf(yr) + 2) + '; padding: 6px 8px 8px; border-left: 1px solid #f0f2f5; display: flex; align-items: stretch; background: ' + (yr === thisYear ? '#fbfcfe' : '#ffffff');
          var base = 'flex: 1; display: flex; flex-direction: column; gap: 2px; border-radius: 8px; padding: 7px 9px; ';
          if (a) {
            var ex = exact(a[3]), done = ex && a[4] < today;
            var kc = kindColor(a[1]);
            var meta = ex ? days(a[3], a[4]) + '일 · MD [ ]' + (a[2] ? ' · 1단계 ' + (exact(a[2]) ? dot(a[2]).slice(5) : '날짜 미정') : '') : '날짜 미정';
            return {
              has: true, wrap: wrap, kind: a[1], meta: meta,
              dates: ex ? dot(a[3]).slice(5) + ' ~ ' + dot(a[4]).slice(5) : yr + '년',
              box: base + (done ? 'background: #e9edf3; color: #2b3644' : ex ? 'background: #e8f0fe; color: ' + kc[0] + '; border: 1.5px solid #1d4ed8' : 'background: #fff7ea; color: #a35f12; border: 1.5px dashed #c77a12')
            };
          }
          if (ghost) return { has: true, wrap: wrap, kind: n.kind + ' (미등록)', dates: '기한 ' + dot(n.due).slice(5), meta: n.kind === '갱신' ? '인증 만료 전까지' : '직전 심사 +1년 이내', box: base + 'background: #fff7ea; color: #a35f12; border: 1.5px dashed #c77a12' };
          if (miss) return { has: true, wrap: wrap, kind: miss[2] + '?', dates: '기록 없음', meta: '엑셀 확인 필요', box: base + 'background: #fdecec; color: #c23b3b; border: 1.5px solid #f3b9b9' };
          return { has: false, wrap: wrap, kind: '', dates: '', meta: '', box: '' };
        })
      };
    });

    var upcoming = this.SITES.map(function (s) { return { s: s, n: nextOf[s[0]] }; }).filter(function (o) { return o.n; })
      .sort(function (a, b) { return sk(a.n.start) < sk(b.n.start) ? -1 : 1; }).slice(0, 6)
      .map(function (o) { return { site: o.s[1], kind: o.n.kind, kindStyle: kindStyle(o.n.kind), when: whenText(o.n), dday: ddayText(o.n), ddayStyle: ddayStyle(o.n) }; });

    var arrow = function (on) { return 'width: 32px; height: 32px; border-radius: 16px; border: 1px solid #d5dbe4; background: #ffffff; font-size: 18px; line-height: 1; cursor: ' + (on ? 'pointer' : 'default') + '; opacity: ' + (on ? 1 : 0.35); };
    var canPrev = st.start > 2022, canNext = st.start < 2026;

    var chip = function (on) { return 'border: 1px solid ' + (on ? '#141a23' : '#d5dbe4') + '; background: ' + (on ? '#141a23' : '#ffffff') + '; color: ' + (on ? '#ffffff' : '#2b3644') + '; border-radius: 16px; padding: 5px 12px; font: inherit; font-size: 12px; cursor: pointer'; };
    var rows = [];
    this.AUDITS.forEach(function (a, idx) {
      if (!exact(a[3]) || a[4] >= today) return;
      var s = siteOf[a[0]];
      if (st.site !== '전체' && s[1] !== st.site) return;
      if (st.kind !== '전체' && a[1] !== st.kind) return;
      var open = st.open === idx;
      rows.push({
        sort: a[3], year: a[3].slice(0, 4), kind: a[1], kindStyle: kindStyle(a[1]), site: s[1] + ' · ' + s[2],
        dates: dot(a[3]) + ' ~ ' + dot(a[4]).slice(5) + ' (' + days(a[3], a[4]) + '일)', open: open,
        toggle: function () { self.setState({ open: open ? -1 : idx }); },
        rowStyle: 'display: grid; grid-template-columns: 60px 90px 150px 190px 70px 120px 60px 60px 60px minmax(0, 1fr); gap: 8px; padding: 12px 16px; border: 0; width: 100%; text-align: left; font: inherit; font-size: 13px; color: #141a23; cursor: pointer; align-items: center; background: ' + (open ? '#eef4ff' : '#ffffff')
      });
    });
    rows.sort(function (a, b) { return a.sort < b.sort ? 1 : -1; });

    return {
      admin: st.admin,
      adminPressed: st.admin ? 'true' : 'false',
      toggleAdmin: function () { self.setState({ admin: !st.admin }); },
      switchTrack: 'width: 40px; height: 24px; border-radius: 12px; position: relative; display: inline-block; background: ' + (st.admin ? '#1d4ed8' : '#cfd5de'),
      switchKnob: 'position: absolute; top: 3px; left: ' + (st.admin ? '19px' : '3px') + '; width: 18px; height: 18px; border-radius: 9px; background: #ffffff',
      orgCards: orgCards, certKpis: certKpis, simpleCards: simpleCards, certRows: certRows, certCards: certCards,
      rangeLabel: years[0] + ' – ' + years[4],
      prev: function () { if (canPrev) self.setState({ start: st.start - 1 }); },
      next: function () { if (canNext) self.setState({ start: st.start + 1 }); },
      prevStyle: arrow(canPrev), nextStyle: arrow(canNext),
      yearHeads: years.map(function (yr) { return { label: yr + (yr === thisYear ? ' · 올해' : ''), style: 'padding: 11px 14px; border-left: 1px solid #eef1f5; color: ' + (yr === thisYear ? '#1d4ed8' : '#4a5566') }; }),
      gridRows: gridRows,
      upcoming: upcoming,
      kindChips: ['전체', '최초', '갱신', '사후1차', '사후2차'].map(function (k) { return { label: k, style: chip(k === st.kind), pick: function () { self.setState({ kind: k, open: -1 }); } }; }),
      siteChips: ['전체'].concat(this.SITES.map(function (s) { return s[1]; })).map(function (k) { return { label: k === '전체' ? '전 사업장' : k, style: chip(k === st.site), pick: function () { self.setState({ site: k, open: -1 }); } }; }),
      rows: rows,
      rowCount: rows.length
    };
  }

  render(){ const v=this.renderVals();  return React.createElement(React.Fragment,null,"\n",React.createElement(React.Fragment,null,"\n","\n","\n",React.createElement("style",{}, "\nbody{margin:0;background:#f5f7fa}\na{color:#1d4ed8;text-decoration:none}a:hover{color:#1e3a8a}\n"),"\n"),"\n",React.createElement("div",{"style":styleObject("min-height: 2300px; background: #f5f7fa; font-family: 'Noto Sans KR', sans-serif; color: #141a23")}, "\n",React.createElement("header",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 22px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("display: flex; align-items: center; gap: 10px; color: #0b2343"),"data-bound":""}, React.createElement("span",{"style":styleObject("width: 34px; height: 34px; border-radius: 9px; background: #0b2343; color: #ffffff; display: grid; place-items: center; font-weight: 900; font-size: 13px")}, "AJ"),React.createElement("span",{"style":styleObject("font-size: 20px; font-weight: 900")}, "AJIN ON")),"\n",React.createElement("span",{"style":styleObject("width: 1px; height: 18px; background: #d9dee6"),"aria-hidden":"true"}),"\n",React.createElement("button",{"type":"button","onClick":v.toggleAdmin,"aria-pressed":v.adminPressed,"style":styleObject("display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 6px 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; color: #2b3644"),"data-bound":(typeof v.toggleAdmin === "function" ? "1" : "")}, "본사 관리자\n",React.createElement("span",{"style":styleObject(v.switchTrack)}, React.createElement("span",{"style":styleObject(v.switchKnob)})),"\n"),"\n",React.createElement("nav",{"aria-label":"주요 업무","style":styleObject("display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "홈"),"\n",React.createElement("a",{"href":"Qstar.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "품질5스타"),"\n",React.createElement("a",{"href":"FieldAudit.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "현장평가"),"\n",React.createElement("a",{"href":"Internal.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "내부 현장평가"),"\n",React.createElement("a",{"href":"SQ.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "SQ평가"),"\n",React.createElement("a",{"href":"IATF.dc.html","style":styleObject("color: #141a23; font-weight: 700; border-bottom: 2px solid #141a23; padding-bottom: 4px"),"data-bound":""}, "IATF 16949"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "원가절감"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "교육"),"\n"),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 14px; color: #4a5566")}, "품질경영팀 · 홍길동"),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 0; display: flex; flex-direction: column; gap: 18px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 6px")}, React.createElement("span",{"style":styleObject("font-size: 13px; color: #66758a")}, "홈 › IATF 16949"),React.createElement("h1",{"style":styleObject("margin: 0; font-size: 30px; font-weight: 900; letter-spacing: -0.02em")}, "IATF 16949")),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; display: flex; gap: 8px")}, "\n",React.createElement("a",{"href":"#","style":styleObject("font-size: 13px; color: #2b3644; border: 1px solid #d5dbe4; border-radius: 9px; padding: 9px 14px; background: #ffffff"),"data-bound":""}, "인증서 보기"),"\n",(v.admin ? React.createElement(React.Fragment,null,React.createElement("a",{"href":"#","style":styleObject("font-size: 13px; color: #ffffff; background: #141a23; border-radius: 9px; padding: 9px 14px"),"data-bound":""}, "심사 결과 등록")) : null),"\n"),"\n"),"\n",React.createElement("nav",{"aria-label":"IATF 탭","style":styleObject("display: flex; flex-wrap: wrap; gap: 28px; font-size: 15px")}, "\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "IATF 16949란?"),"\n",React.createElement("a",{"href":"#cert","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "인증 현황"),"\n",React.createElement("a",{"href":"#schedule","style":styleObject("color: #141a23; font-weight: 700; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px"),"data-bound":""}, "심사 일정"),"\n",React.createElement("a",{"href":"#history","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "심사이력"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "부적합 관리"),"\n"),"\n"),"\n"),"\n\n",React.createElement("main",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 64px; display: flex; flex-direction: column; gap: 22px")}, "\n\n",React.createElement("section",{"id":"cert","aria-label":"인증 현황","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 14px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, "인증 현황"),React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, "법인 8곳 · 인증 사업장 10곳")),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start")}, "\n",(v.certCards ?? []).map((c,i52)=>React.createElement(React.Fragment,{key:i52},"\n",React.createElement("div",{"style":styleObject(c.style)}, "\n",React.createElement("b",{"style":styleObject("font-size: 18px; color: #0b2343")}, c.name),"\n",React.createElement("span",{"style":styleObject("font-size: 13px; color: #4a5566")}, c.summary),"\n",(c.single ? React.createElement(React.Fragment,null,React.createElement("span",{"style":styleObject("font-size: 13px; color: #141a23")}, "인증서 "+String(c.no ?? ""))) : null),"\n",(c.multi ? React.createElement(React.Fragment,null,"\n",React.createElement("button",{"type":"button","onClick":c.toggle,"style":styleObject("align-self: flex-start; border: 1px solid #d5dbe4; background: #ffffff; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 13px; color: #2b3644; cursor: pointer"),"data-bound":(typeof c.toggle === "function" ? "1" : "")}, c.toggleLabel),"\n") : null),"\n",(c.open ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 6px; margin-top: 4px")}, "\n",(c.plants ?? []).map((p,i53)=>React.createElement(React.Fragment,{key:i53},React.createElement("span",{"style":styleObject(p.style)}, React.createElement("b",{}, p.name),React.createElement("span",{}, p.text)))),"\n"),"\n") : null),"\n"),"\n")),"\n"),"\n"),"\n\n",React.createElement("section",{"id":"schedule","aria-label":"심사 일정","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, "심사 일정"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, "위 띠 = 인증 주기 3년 (갱신일부터 3년 안에 다음 갱신) · 아래 칸 = 매년 심사"),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; display: flex; align-items: center; gap: 8px")}, "\n",React.createElement("button",{"type":"button","onClick":v.prev,"aria-label":"이전 연도","style":styleObject(v.prevStyle),"data-bound":(typeof v.prev === "function" ? "1" : "")}, "‹"),"\n",React.createElement("b",{"style":styleObject("font-size: 14px; min-width: 96px; text-align: center")}, v.rangeLabel),"\n",React.createElement("button",{"type":"button","onClick":v.next,"aria-label":"다음 연도","style":styleObject(v.nextStyle),"data-bound":(typeof v.next === "function" ? "1" : "")}, "›"),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: #4a5566; align-items: center")}, "\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 28px; height: 10px; border-radius: 5px; background: #0b2343")}),"인증 주기 3년 (갱신일 → 만료일)"),"\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 28px; height: 10px; border-radius: 5px; background: repeating-linear-gradient(135deg, #9aa8bd 0 6px, #c3ccd9 6px 12px)")}),"추정 · 예정 주기"),"\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 14px; height: 14px; border-radius: 4px; background: #e9edf3")}),"완료"),"\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 14px; height: 14px; border-radius: 4px; background: #e8f0fe; border: 1.5px solid #1d4ed8")}),"예정 (날짜 확정)"),"\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 14px; height: 14px; border-radius: 4px; background: #fff7ea; border: 1.5px dashed #c77a12")}),"날짜 미정 · 자동 예측"),"\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 6px")}, React.createElement("span",{"style":styleObject("width: 14px; height: 14px; border-radius: 4px; background: #fdecec; border: 1.5px solid #c23b3b")}),"빠진 기록 확인 필요"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("overflow-x: auto")}, "\n",React.createElement("div",{"role":"table","style":styleObject("min-width: 980px; display: flex; flex-direction: column; border: 1px solid #e3e8ef; border-radius: 12px; overflow: hidden")}, "\n",React.createElement("div",{"role":"row","style":styleObject("display: grid; grid-template-columns: 170px repeat(5, minmax(0, 1fr)); background: #f7f9fc; font-size: 12px; font-weight: 700; color: #4a5566")}, "\n",React.createElement("span",{"style":styleObject("padding: 11px 14px")}, "사업장"),"\n",(v.yearHeads ?? []).map((y,i54)=>React.createElement(React.Fragment,{key:i54},React.createElement("span",{"style":styleObject(y.style)}, y.label))),"\n"),"\n",(v.gridRows ?? []).map((r,i55)=>React.createElement(React.Fragment,{key:i55},"\n",React.createElement("div",{"role":"row","style":styleObject("display: grid; grid-template-columns: 170px repeat(5, minmax(0, 1fr)); border-top: 1px solid #f0f2f5")}, "\n",React.createElement("span",{"style":styleObject("grid-row: 1 / span 2; grid-column: 1; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px")}, React.createElement("b",{"style":styleObject("font-size: 14px")}, r.site),React.createElement("span",{"style":styleObject("font-size: 11px; color: #66758a")}, r.org)),"\n",(r.bars ?? []).map((b,i56)=>React.createElement(React.Fragment,{key:i56},React.createElement("span",{"style":styleObject(b.style),"title":b.title}, React.createElement("b",{}, b.label),React.createElement("span",{"style":styleObject("opacity: 0.85")}, b.range)))),"\n",(r.cells ?? []).map((c,i57)=>React.createElement(React.Fragment,{key:i57},"\n",React.createElement("span",{"style":styleObject(c.wrap)}, "\n",(c.has ? React.createElement(React.Fragment,null,"\n",React.createElement("span",{"style":styleObject(c.box)}, "\n",React.createElement("b",{"style":styleObject("font-size: 12px")}, c.kind),"\n",React.createElement("span",{"style":styleObject("font-size: 12px")}, c.dates),"\n",React.createElement("span",{"style":styleObject("font-size: 11px; opacity: 0.75")}, c.meta),"\n"),"\n") : null),"\n"),"\n")),"\n"),"\n")),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 14px; align-items: stretch")}, "\n",React.createElement("div",{"style":styleObject("flex: 1 1 520px; border: 1px solid #e3e8ef; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px")}, "\n",React.createElement("b",{"style":styleObject("font-size: 14px")}, "다가오는 심사"),"\n",(v.upcoming ?? []).map((u,i58)=>React.createElement(React.Fragment,{key:i58},"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: 120px 80px minmax(0, 1fr) 90px; gap: 10px; align-items: center; font-size: 13px")}, "\n",React.createElement("b",{}, u.site),React.createElement("span",{"style":styleObject(u.kindStyle)}, u.kind),React.createElement("span",{"style":styleObject("color: #4a5566")}, u.when),React.createElement("b",{"style":styleObject(u.ddayStyle)}, u.dday),"\n"),"\n")),"\n"),"\n",React.createElement("div",{"style":styleObject("flex: 1 1 320px; background: #f7f9fc; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #4a5566; line-height: 1.6")}, "\n",React.createElement("b",{"style":styleObject("font-size: 13px; color: #141a23")}, "입력 방법"),"\n",React.createElement("span",{}, "심사 1건 = 사업장 · 구분(최초/갱신/사후1차/사후2차) · 1단계일(최초만) · 시작일 · 종료일 · MD · 인증기관을 한 줄로 저장합니다."),"\n",React.createElement("span",{}, "날짜를 아직 모르면 연도만 넣어 두면 ‘날짜 미정’으로 뜨고, 다음 심사가 비어 있으면 마지막 심사 +1년으로 자동 예측해 점선으로 보여줍니다."),"\n",(v.admin ? React.createElement(React.Fragment,null,React.createElement("button",{"type":"button","style":styleObject("align-self: flex-start; margin-top: 4px; border: 0; background: #141a23; color: #ffffff; border-radius: 9px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer"),"data-bound":""}, "+ 심사 일정 추가")) : null),"\n"),"\n"),"\n"),"\n\n",React.createElement("section",{"id":"history","aria-label":"심사이력","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, "심사이력"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, "완료된 심사 "+String(v.rowCount ?? "")+"건 · 행을 누르면 부적합 내용이 펼쳐집니다"),"\n",React.createElement("button",{"type":"button","style":styleObject("margin-left: auto; border: 0; background: #1f7a55; color: #ffffff; border-radius: 9px; padding: 8px 14px; font: inherit; font-size: 13px; cursor: pointer"),"data-bound":""}, "엑셀로 내려받기"),"\n"),"\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 6px; align-items: center")}, "\n",(v.kindChips ?? []).map((c,i59)=>React.createElement(React.Fragment,{key:i59},React.createElement("button",{"type":"button","onClick":c.pick,"style":styleObject(c.style),"data-bound":(typeof c.pick === "function" ? "1" : "")}, c.label))),"\n",React.createElement("span",{"style":styleObject("width: 1px; height: 20px; background: #e3e8ef; margin: 0 6px"),"aria-hidden":"true"}),"\n",(v.siteChips ?? []).map((c,i60)=>React.createElement(React.Fragment,{key:i60},React.createElement("button",{"type":"button","onClick":c.pick,"style":styleObject(c.style),"data-bound":(typeof c.pick === "function" ? "1" : "")}, c.label))),"\n"),"\n",React.createElement("div",{"style":styleObject("overflow-x: auto")}, "\n",React.createElement("div",{"role":"table","style":styleObject("min-width: 980px; display: flex; flex-direction: column; border: 1px solid #e3e8ef; border-radius: 12px; overflow: hidden")}, "\n",React.createElement("div",{"role":"row","style":styleObject("display: grid; grid-template-columns: 60px 90px 150px 190px 70px 120px 60px 60px 60px minmax(0, 1fr); gap: 8px; padding: 11px 16px; background: #f7f9fc; font-size: 12px; font-weight: 700; color: #4a5566")}, "\n",React.createElement("span",{}, "연도"),React.createElement("span",{}, "구분"),React.createElement("span",{}, "사업장"),React.createElement("span",{}, "심사일"),React.createElement("span",{}, "MD"),React.createElement("span",{}, "인증기관"),React.createElement("span",{}, "Major"),React.createElement("span",{}, "Minor"),React.createElement("span",{}, "OFI"),React.createElement("span",{}, "시정조치"),"\n"),"\n",(v.rows ?? []).map((r,i61)=>React.createElement(React.Fragment,{key:i61},"\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; border-top: 1px solid #f0f2f5")}, "\n",React.createElement("button",{"type":"button","onClick":r.toggle,"style":styleObject(r.rowStyle),"data-bound":(typeof r.toggle === "function" ? "1" : "")}, "\n",React.createElement("span",{}, r.year),React.createElement("span",{"style":styleObject(r.kindStyle)}, r.kind),React.createElement("b",{}, r.site),React.createElement("span",{}, r.dates),React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[MD]"),React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[인증기관]"),"\n",React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[ ]"),React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[ ]"),React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[ ]"),React.createElement("span",{"style":styleObject("color: #8a96a6")}, "[상태]"),"\n"),"\n",(r.open ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("background: #f7f9fc; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px")}, "\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: 90px 70px minmax(0, 1fr) minmax(0, 1fr) 90px; gap: 8px; font-size: 12px; font-weight: 700; color: #66758a")}, React.createElement("span",{}, "조항번호"),React.createElement("span",{}, "판정"),React.createElement("span",{}, "부적합 내용"),React.createElement("span",{}, "시정조치"),React.createElement("span",{}, "상태")),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: 90px 70px minmax(0, 1fr) minmax(0, 1fr) 90px; gap: 8px; font-size: 13px; background: #ffffff; border: 1px solid #e3e8ef; border-radius: 8px; padding: 9px 10px; color: #8a96a6")}, "\n",React.createElement("span",{}, "[조항]"),React.createElement("span",{}, "[판정]"),React.createElement("span",{}, "[부적합 내용 원문]"),React.createElement("span",{}, "[시정조치]"),React.createElement("span",{}, "[상태]"),"\n"),"\n",React.createElement("a",{"href":"#","style":styleObject("align-self: flex-start; font-size: 12px; font-weight: 700"),"data-bound":""}, "심사 보고서 PDF 보기 ›"),"\n"),"\n") : null),"\n"),"\n")),"\n"),"\n"),"\n"),"\n"),"\n"),"\n"); }
}
