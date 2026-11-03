// React implementation of the supplied AJIN ON screen; source layout and business calculations preserved.
import React from "react";
import {PageComponent,styleObject} from "../runtime/PageComponent.jsx";

export default class Internal extends PageComponent {
  constructor(props) {
    super(props);
    this.state = {
      admin: true, round: 'second', month: 11, picked: null,
      roundKind: { first: '불시', second: '정기' },
      order: {
        first: ['gyeongsan', 'hq', 'gueo', 'ipsil', 'juntek', 'geoncheon', 'mohwa', 'ajajin', 'wooshin', 'ajinelec'],
        second: ['gyeongsan', 'hq', 'geoncheon', 'gueo', 'ipsil', 'juntek', 'mohwa', 'ajajin', 'wooshin', 'ajinusa', 'wooshinusa', 'jungeorgia', 'ajinelec']
      },
      dates: {
        first: { gyeongsan: '2026-04-09', hq: '2026-04-16', gueo: '2026-04-23', ipsil: '2026-04-30', juntek: '2026-05-07', geoncheon: '2026-05-14', mohwa: '2026-05-21', ajajin: '2026-05-28', wooshin: '2026-06-04', ajinelec: '2026-06-11' },
        second: { gyeongsan: '2026-10-13', hq: '2026-10-15', geoncheon: '2026-10-17', gueo: '2026-10-22', ipsil: '2026-10-29', juntek: '2026-11-05', mohwa: '2026-11-10', ajajin: '2026-11-12', wooshin: '2026-11-19', ajinusa: '2026-11-24', wooshinusa: '2026-11-25', jungeorgia: '2026-11-26', ajinelec: '' }
      }
    };
  }
  renderVals() {
    var self = this;
    var st = this.state;
    var names = { hq: ['본사', '국내'], gyeongsan: ['경산', '국내'], gueo: ['구어', '국내'], ipsil: ['입실', '국내'], juntek: ['준텍', '국내'], geoncheon: ['건천', '국내'], mohwa: ['모화', '국내'], ajajin: ['AJ아진', '국내'], wooshin: ['우신산업', '국내'], ajinelec: ['아진전자부품', '국내'], ajinusa: ['아진USA', '미국'], wooshinusa: ['우신USA', '미국'], jungeorgia: ['준조지아', '미국'] };
    var d0 = new Date();
    var today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
    var admin = st.admin;
    var r = st.round;
    var order = st.order[r];
    var dates = st.dates[r];
    var kind = st.roundKind[r];
    var kindFirst = st.roundKind.first, kindSecond = st.roundKind.second;
    var statusOf = function (id) { var d = dates[id]; if (!d) return '날짜 미정'; if (d < today) return '평가 완료'; if (d === today) return '오늘'; return '예정'; };
    var fmt = function (d) { return d ? d.slice(0, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10) : '미정'; };
    var byDate = function (list, ds) {
      return list.map(function (id, i) { return { id: id, i: i }; }).sort(function (a, b) {
        var x = ds[a.id], y = ds[b.id];
        if (x && y) return x < y ? -1 : x > y ? 1 : a.i - b.i;
        if (x) return -1; if (y) return 1; return a.i - b.i;
      }).map(function (o) { return o.id; });
    };
    var setRound = function (round) { self.setState({ round: round, picked: null, month: round === 'first' ? 4 : 10 }); };

    var accent = function (k) { return k === '불시' ? '#c77a12' : '#0b2343'; };
    var ev = {
      1: '운영안 게시',
      4: '1차 ' + kindFirst + ' 현장평가 시작', 5: '1차 평가', 6: '1차 평가 마감',
      7: '상반기 결과보고 · 하반기 변경안',
      10: '2차 ' + kindSecond + ' 현장평가 시작', 11: '2차 평가 마감',
      12: '종합보고 · 포상'
    };
    var roundOf = function (m) { return m >= 4 && m <= 6 ? 'first' : (m === 10 || m === 11) ? 'second' : null; };
    var nowM = d0.getMonth() + 1;
    var months12 = [];
    for (var mi = 1; mi <= 12; mi++) {
      (function (i) {
        var past = i < nowM, cur = i === nowM, rd = roundOf(i), sel = rd && rd === r;
        months12.push({
          label: i + '월', event: ev[i] || '',
          pick: rd ? function () { setRound(rd); } : null,
          box: 'display: flex; flex-direction: column; align-items: center; gap: 8px; font: inherit; font-size: 12px; border: 0; padding: 8px 2px; border-radius: 10px; color: inherit; cursor: ' + (rd ? 'pointer' : 'default') + '; background: ' + (sel ? '#eef4ff' : 'transparent'),
          dotStyle: 'width: ' + (cur ? 16 : 12) + 'px; height: ' + (cur ? 16 : 12) + 'px; border-radius: 50%; background: ' + (past ? '#141a23' : cur ? '#1d4ed8' : '#ffffff') + '; border: 2px solid ' + (past ? '#141a23' : '#1d4ed8') + (cur ? '; box-shadow: 0 0 0 5px rgba(29,78,216,0.15)' : ''),
          labelStyle: 'font-weight: ' + (cur || sel ? 700 : 500) + '; color: ' + (cur ? '#1d4ed8' : '#2b3644')
        });
      })(mi);
    }

    var secret = function (id) { return !admin && kind === '불시' && !(dates[id] && dates[id] <= today); };
    var shown = order.filter(function (id) { return !secret(id); });
    var hidden = order.filter(secret).sort(function (a, b) { return names[a][0].localeCompare(names[b][0], 'ko'); });
    var visibleList = shown.concat(hidden);
    var picked = admin ? st.picked : null;
    var cards = visibleList.map(function (id) {
      var i = order.indexOf(id);
      var hid = secret(id);
      var status = hid ? '일정 비공개' : statusOf(id);
      var sc = { '평가 완료': ['#e7f5ee', '#1f7a55'], '오늘': ['#e8f0fe', '#1d4ed8'], '예정': ['#f0f2f5', '#4a5566'], '날짜 미정': ['#fdecec', '#c23b3b'], '일정 비공개': ['#fff1dc', '#a35f12'] }[status];
      var isPicked = picked === id;
      var isTarget = picked && !isPicked;
      return {
        name: names[id][0], area: names[id][1], order: hid ? '?' : (admin ? i + 1 : shown.indexOf(id) + 1), date: dates[id] || '', dateText: hid ? '불시 · 비공개' : fmt(dates[id]), status: status,
        cursor: admin ? 'pointer' : 'default',
        pickLabel: admin ? (isTarget ? names[id][0] + ' 자리로 옮기기' : names[id][0] + ' 카드 선택') : names[id][0],
        box: 'border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; background: ' + (isPicked ? '#eef4ff' : '#ffffff') + '; border: ' + (isPicked ? '2px solid #1d4ed8' : isTarget ? '1px dashed #7ea2e8' : '1px solid #e3e8ef') + (isPicked ? '; box-shadow: 0 8px 20px rgba(29,78,216,0.18)' : ''),
        orderStyle: 'width: 26px; height: 26px; border-radius: 13px; display: grid; place-items: center; font-size: 12px; font-weight: 900; flex: none; color: #ffffff; background: ' + (isPicked ? '#1d4ed8' : accent(kind)),
        statusStyle: 'align-self: flex-start; font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; background: ' + sc[0] + '; color: ' + sc[1],
        pick: function () {
          if (!admin) return;
          if (!st.picked) { self.setState({ picked: id }); return; }
          if (st.picked === id) { self.setState({ picked: null }); return; }
          var list = order.slice(); var from = st.picked;
          list.splice(list.indexOf(from), 1); list.splice(list.indexOf(id), 0, from);
          var next = Object.assign({}, st.order); next[r] = list;
          self.setState({ order: next, picked: null });
        },
        setDate: function (e) {
          var v = e.target.value;
          var nd = Object.assign({}, st.dates); nd[r] = Object.assign({}, dates); nd[r][id] = v;
          var no = Object.assign({}, st.order); no[r] = byDate(order, nd[r]);
          var patch = { dates: nd, order: no, picked: null };
          if (v) patch.month = Number(v.slice(5, 7));
          self.setState(patch);
        }
      };
    });

    var doneN = order.filter(function (id) { return statusOf(id) === '평가 완료'; }).length;
    var undated = order.filter(function (id) { return !dates[id]; }).length;
    var nextId = order.filter(function (id) { return dates[id] && dates[id] >= today; })[0];

    var months = r === 'first' ? [4, 5, 6] : [10, 11, 12];
    var month = months.indexOf(st.month) >= 0 ? st.month : months[0];
    var year = 2026;
    var first = new Date(year, month - 1, 1).getDay();
    var days = new Date(year, month, 0).getDate();
    var cells = [];
    for (var i = 0; i < first; i++) cells.push({ num: '', events: [], box: 'min-height: 96px; border-radius: 10px; background: #fafbfc', numStyle: '' });
    for (var d = 1; d <= days; d++) {
      var iso = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dow = (first + d - 1) % 7;
      var evs = order.filter(function (id) { return dates[id] === iso && !secret(id); }).map(function (id) {
        return { label: (order.indexOf(id) + 1) + '. ' + names[id][0], style: 'display: block; font-size: 12px; font-weight: 700; border-radius: 6px; padding: 3px 6px; color: #ffffff; background: ' + accent(kind) + (iso < today ? '; opacity: 0.55' : '') };
      });
      var isToday = iso === today;
      cells.push({
        num: d, events: evs,
        box: 'min-height: 96px; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 4px; border: ' + (isToday ? '2px solid #1d4ed8' : '1px solid #e3e8ef') + '; background: ' + (dow === 0 || dow === 6 ? '#f7f9fc' : '#ffffff'),
        numStyle: 'font-size: 13px; font-weight: 700; color: ' + (dow === 0 ? '#c23b3b' : dow === 6 ? '#2f6fd6' : '#2b3644')
      });
    }
    var tab = function (on) { return 'border: 0; border-radius: 7px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; font-weight: 700; background: ' + (on ? '#ffffff' : 'transparent') + '; color: ' + (on ? '#141a23' : '#66758a'); };
    var badge = 'font-size: 12px; font-weight: 700; border-radius: 8px; padding: 4px 10px; color: #ffffff; background: ' + accent(kind);
    return {
      admin: admin, viewer: !admin,
      adminPressed: admin ? 'true' : 'false',
      toggleAdmin: function () { self.setState({ admin: !admin, picked: null }); },
      switchTrack: 'width: 40px; height: 24px; border-radius: 12px; position: relative; display: inline-block; background: ' + (admin ? '#1d4ed8' : '#cfd5de'),
      switchKnob: 'position: absolute; top: 3px; left: ' + (admin ? '19px' : '3px') + '; width: 18px; height: 18px; border-radius: 9px; background: #ffffff',
      months12: months12, cards: cards,
      roundTitle: (r === 'first' ? '1차 ' : '2차 ') + kind + ' 현장평가',
      roundShort: r === 'first' ? '1차' : '2차',
      roundKindLabel: kind + ' 평가',
      roundKindStyle: 'border: 0; cursor: pointer; font: inherit; ' + badge,
      roundKindBadge: badge,
      toggleRoundKind: function () { var k = Object.assign({}, st.roundKind); k[r] = kind === '정기' ? '불시' : '정기'; self.setState({ roundKind: k }); },
      firstBtn: tab(r === 'first'), secondBtn: tab(r === 'second'),
      pickFirst: function () { setRound('first'); },
      pickSecond: function () { setRound('second'); },
      hasPicked: !!picked,
      pickedMsg: picked ? names[picked][0] + ' 선택됨 · 옮길 자리의 카드를 누르세요' : '',
      cancelPick: function () { self.setState({ picked: null }); },
      guide: admin ? '평가일을 지정하면 날짜순으로 자동 정렬됩니다 · 카드 이름을 누른 뒤 옮길 자리의 카드를 누르면 순서가 바뀝니다' : (kind === '불시' ? '불시평가는 평가가 끝난 공장만 날짜가 공개됩니다 · 남은 공장은 가나다순' : '평가일과 순서만 표시됩니다 (관리자만 수정 가능)'),
      summary: [{ label: '대상 공장', value: order.length + '개' }, { label: '평가 완료', value: doneN + '개' }, { label: '다음 평가', value: (!admin && kind === '불시') ? '비공개' : (nextId ? names[nextId][0] : '-') }, { label: '날짜 미정', value: undated + '개' }],
      monthTabs: months.map(function (m) { var on = m === month; return { label: m + '월', pick: function () { self.setState({ month: m }); }, style: 'border: 1px solid ' + (on ? '#141a23' : '#d5dbe4') + '; background: ' + (on ? '#141a23' : '#ffffff') + '; color: ' + (on ? '#ffffff' : '#2b3644') + '; border-radius: 9px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer' }; }),
      weekdays: ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) { return { label: w, style: 'text-align: center; font-size: 12px; font-weight: 700; padding: 4px 0; color: ' + (i === 0 ? '#c23b3b' : i === 6 ? '#2f6fd6' : '#66758a') }; }),
      cells: cells
    };
  }

  render(){ const v=this.renderVals();  return React.createElement(React.Fragment,null,"\n",React.createElement(React.Fragment,null,"\n","\n","\n",React.createElement("style",{}, "\nbody{margin:0;background:#f5f7fa}\na{color:#1d4ed8;text-decoration:none}a:hover{color:#1e3a8a}\n"),"\n"),"\n",React.createElement("div",{"style":styleObject("min-height: 1700px; background: #f5f7fa; font-family: 'Noto Sans KR', sans-serif; color: #141a23")}, "\n",React.createElement("header",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 22px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("display: flex; align-items: center; gap: 10px; color: #0b2343"),"data-bound":""}, React.createElement("span",{"style":styleObject("width: 34px; height: 34px; border-radius: 9px; background: #0b2343; color: #ffffff; display: grid; place-items: center; font-weight: 900; font-size: 13px")}, "AJ"),React.createElement("span",{"style":styleObject("font-size: 20px; font-weight: 900")}, "AJIN ON")),"\n",React.createElement("span",{"style":styleObject("width: 1px; height: 18px; background: #d9dee6"),"aria-hidden":"true"}),"\n",React.createElement("button",{"type":"button","onClick":v.toggleAdmin,"aria-pressed":v.adminPressed,"style":styleObject("display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 6px 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; color: #2b3644"),"data-bound":(typeof v.toggleAdmin === "function" ? "1" : "")}, "본사 관리자\n",React.createElement("span",{"style":styleObject(v.switchTrack)}, React.createElement("span",{"style":styleObject(v.switchKnob)})),"\n"),"\n",React.createElement("nav",{"aria-label":"주요 업무","style":styleObject("display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "홈"),"\n",React.createElement("a",{"href":"Qstar.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "품질5스타"),"\n",React.createElement("a",{"href":"FieldAudit.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "현장평가"),"\n",React.createElement("a",{"href":"Internal.dc.html","style":styleObject("color: #141a23; font-weight: 700; border-bottom: 2px solid #141a23; padding-bottom: 4px"),"data-bound":""}, "내부 현장평가"),"\n",React.createElement("a",{"href":"SQ.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "SQ평가"),"\n",React.createElement("a",{"href":"IATF.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "IATF 16949"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "원가절감"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "교육"),"\n"),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 14px; color: #4a5566")}, "품질경영팀 · 홍길동"),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 0; display: flex; flex-direction: column; gap: 18px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 6px")}, React.createElement("span",{"style":styleObject("font-size: 13px; color: #66758a")}, "홈 › 내부 현장평가"),React.createElement("h1",{"style":styleObject("margin: 0; font-size: 30px; font-weight: 900; letter-spacing: -0.02em")}, "내부 현장평가")),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; display: flex; gap: 8px")}, "\n",React.createElement("a",{"href":"#","style":styleObject("font-size: 13px; color: #2b3644; border: 1px solid #d5dbe4; border-radius: 9px; padding: 9px 14px; background: #ffffff"),"data-bound":""}, "2026년 운영안"),"\n",React.createElement("a",{"href":"#","style":styleObject("font-size: 13px; color: #ffffff; background: #141a23; border-radius: 9px; padding: 9px 14px"),"data-bound":""}, "평가 작성 도우미 열기"),"\n"),"\n"),"\n",React.createElement("nav",{"aria-label":"내부 현장평가 탭","style":styleObject("display: flex; flex-wrap: wrap; gap: 28px; font-size: 15px")}, "\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "내부 현장평가란?"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "운영안"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #141a23; font-weight: 700; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px"),"data-bound":""}, "전체일정"),"\n",React.createElement("a",{"href":"EvalHistory.dc.html","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "평가이력"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "결과보고"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #66758a; padding-bottom: 12px"),"data-bound":""}, "평가원"),"\n"),"\n"),"\n"),"\n\n",React.createElement("main",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 64px; display: flex; flex-direction: column; gap: 22px")}, "\n\n",React.createElement("section",{"aria-label":"연간 타임라인","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; align-items: center; gap: 10px")}, React.createElement("h2",{"style":styleObject("margin: 0; font-size: 16px; font-weight: 700")}, "2026년 연간 흐름"),React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, "1차 4~6월 · 2차 10~11월 · 평가 달을 누르면 아래 일정이 해당 차수로 바뀝니다")),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 0; position: relative")}, "\n",(v.months12 ?? []).map((m,i26)=>React.createElement(React.Fragment,{key:i26},"\n",React.createElement("button",{"type":"button","onClick":m.pick,"style":styleObject(m.box),"data-bound":(typeof m.pick === "function" ? "1" : "")}, "\n",React.createElement("span",{"style":styleObject(m.dotStyle)}),"\n",React.createElement("span",{"style":styleObject(m.labelStyle)}, m.label),"\n",React.createElement("span",{"style":styleObject("font-size: 11px; color: #4a5566; text-align: center; min-height: 30px; line-height: 1.35")}, m.event),"\n"),"\n")),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start")}, "\n",React.createElement("section",{"aria-label":"공장별 평가 순서","style":styleObject("flex: 999 1 640px; min-width: 0; background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, v.roundTitle),"\n",(v.admin ? React.createElement(React.Fragment,null,"\n",React.createElement("button",{"type":"button","onClick":v.toggleRoundKind,"style":styleObject(v.roundKindStyle),"data-bound":(typeof v.toggleRoundKind === "function" ? "1" : "")}, String(v.roundKindLabel ?? "")+" ⇄"),"\n") : null),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; display: flex; gap: 4px; background: #f0f2f5; border-radius: 10px; padding: 4px")}, "\n",React.createElement("button",{"type":"button","onClick":v.pickFirst,"style":styleObject(v.firstBtn),"data-bound":(typeof v.pickFirst === "function" ? "1" : "")}, "1차"),"\n",React.createElement("button",{"type":"button","onClick":v.pickSecond,"style":styleObject(v.secondBtn),"data-bound":(typeof v.pickSecond === "function" ? "1" : "")}, "2차"),"\n"),"\n"),"\n",(v.hasPicked ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; align-items: center; gap: 10px; background: #e8f0fe; color: #1d4ed8; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700")}, "\n",React.createElement("span",{}, v.pickedMsg),"\n",React.createElement("button",{"type":"button","onClick":v.cancelPick,"style":styleObject("margin-left: auto; border: 0; background: #ffffff; color: #1d4ed8; border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer"),"data-bound":(typeof v.cancelPick === "function" ? "1" : "")}, "취소"),"\n"),"\n") : null),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px")}, "\n",(v.cards ?? []).map((c,i27)=>React.createElement(React.Fragment,{key:i27},"\n",React.createElement("div",{"style":styleObject(c.box)}, "\n",React.createElement("button",{"type":"button","onClick":c.pick,"aria-label":c.pickLabel,"style":styleObject("display: flex; align-items: center; gap: 8px; border: 0; background: transparent; padding: 0; font: inherit; color: #141a23; text-align: left; cursor: "+String(c.cursor ?? "")),"data-bound":(typeof c.pick === "function" ? "1" : "")}, "\n",React.createElement("span",{"style":styleObject(c.orderStyle)}, c.order),"\n",React.createElement("b",{"style":styleObject("font-size: 15px")}, c.name),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 11px; color: #66758a")}, c.area),"\n"),"\n",(v.admin ? React.createElement(React.Fragment,null,"\n",React.createElement("label",{"style":styleObject("display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #66758a")}, "평가일 지정\n",React.createElement("input",{"type":"date","value":c.date,"onChange":c.setDate,"style":styleObject("height: 36px; border: 1px solid #d5dbe4; border-radius: 8px; padding: 0 8px; font: inherit; font-size: 13px; color: #141a23")}),"\n"),"\n") : null),"\n",(v.viewer ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 2px")}, React.createElement("span",{"style":styleObject("font-size: 11px; color: #66758a")}, "평가일"),React.createElement("b",{"style":styleObject("font-size: 16px")}, c.dateText)),"\n") : null),"\n",React.createElement("span",{"style":styleObject(c.statusStyle)}, c.status),"\n"),"\n")),"\n"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, v.guide),"\n"),"\n\n",React.createElement("div",{"style":styleObject("flex: 1 1 280px; display: flex; flex-direction: column; gap: 22px")}, "\n",React.createElement("section",{"aria-label":"차수 요약","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 12px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, String(v.roundShort ?? "")+" 요약"),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px")}, "\n",(v.summary ?? []).map((m,i28)=>React.createElement(React.Fragment,{key:i28},"\n",React.createElement("div",{"style":styleObject("border: 1px solid #e3e8ef; border-radius: 12px; padding: 12px 14px")}, React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, m.label),React.createElement("div",{"style":styleObject("font-size: 22px; font-weight: 900; margin-top: 2px")}, m.value)),"\n")),"\n"),"\n"),"\n",React.createElement("section",{"aria-label":"운영안","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 12px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, "운영안 요약"),"\n",React.createElement("div",{"style":styleObject("display: flex; gap: 12px; align-items: flex-start")}, React.createElement("span",{"style":styleObject("width: 30px; height: 30px; border-radius: 9px; background: #e6f3fb; color: #1b7fb5; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: none")}, "1"),React.createElement("div",{}, React.createElement("b",{"style":styleObject("font-size: 14px")}, "PL 정기회의"),React.createElement("div",{"style":styleObject("font-size: 12px; color: #4a5566; margin-top: 3px")}, "매월 · 안건, 회의록, 우수사례 공유"))),"\n",React.createElement("div",{"style":styleObject("display: flex; gap: 12px; align-items: flex-start")}, React.createElement("span",{"style":styleObject("width: 30px; height: 30px; border-radius: 9px; background: #e6f3fb; color: #1b7fb5; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: none")}, "2"),React.createElement("div",{}, React.createElement("b",{"style":styleObject("font-size: 14px")}, "인센티브 · 반성회"),React.createElement("div",{"style":styleObject("font-size: 12px; color: #4a5566; margin-top: 3px")}, "반기 결과로 상위 공장 포상, 하위 공장 반성회"))),"\n",React.createElement("div",{"style":styleObject("display: flex; gap: 12px; align-items: flex-start")}, React.createElement("span",{"style":styleObject("width: 30px; height: 30px; border-radius: 9px; background: #e6f3fb; color: #1b7fb5; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: none")}, "3"),React.createElement("div",{}, React.createElement("b",{"style":styleObject("font-size: 14px")}, "평가기준"),React.createElement("div",{"style":styleObject("font-size: 12px; color: #4a5566; margin-top: 3px")}, "품질5스타 평가서와 같은 항목번호·배점 사용"))),"\n"),"\n",React.createElement("section",{"aria-label":"평가 작성 도우미","style":styleObject("background: #0b2343; color: #ffffff; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 10px")}, "\n",React.createElement("b",{"style":styleObject("font-size: 17px")}, "평가 작성 도우미"),"\n",React.createElement("span",{"style":styleObject("font-size: 13px; color: #c9d5e5; line-height: 1.6")}, "현장에서 본 내용을 줄글로 쓰면 평가기준과 과거 이력을 참고해 항목·멘트·판정을 채우고, 정해진 양식의 엑셀로 내보냅니다."),"\n",React.createElement("a",{"href":"#","style":styleObject("align-self: flex-start; background: #ffffff; color: #0b2343; font-weight: 700; font-size: 13px; border-radius: 9px; padding: 9px 14px; margin-top: 4px"),"data-bound":""}, "관찰내용 입력하기 ›"),"\n"),"\n"),"\n"),"\n\n",React.createElement("section",{"aria-label":"평가 달력","style":styleObject("background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 18px; font-weight: 700")}, String(v.roundShort ?? "")+" 평가 달력"),"\n",React.createElement("span",{"style":styleObject(v.roundKindBadge)}, v.roundKindLabel),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; display: flex; gap: 6px")}, "\n",(v.monthTabs ?? []).map((t,i29)=>React.createElement(React.Fragment,{key:i29},"\n",React.createElement("button",{"type":"button","onClick":t.pick,"style":styleObject(t.style),"data-bound":(typeof t.pick === "function" ? "1" : "")}, t.label),"\n")),"\n"),"\n"),"\n",React.createElement("div",{"style":styleObject("overflow-x: auto")}, "\n",React.createElement("div",{"style":styleObject("min-width: 760px; display: flex; flex-direction: column; gap: 6px")}, "\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px")}, "\n",(v.weekdays ?? []).map((w,i30)=>React.createElement(React.Fragment,{key:i30},"\n",React.createElement("span",{"style":styleObject(w.style)}, w.label),"\n")),"\n"),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px")}, "\n",(v.cells ?? []).map((d,i31)=>React.createElement(React.Fragment,{key:i31},"\n",React.createElement("div",{"style":styleObject(d.box)}, "\n",React.createElement("span",{"style":styleObject(d.numStyle)}, d.num),"\n",(d.events ?? []).map((e,i32)=>React.createElement(React.Fragment,{key:i32},"\n",React.createElement("span",{"style":styleObject(e.style)}, e.label),"\n")),"\n"),"\n")),"\n"),"\n"),"\n"),"\n"),"\n"),"\n"),"\n"); }
}
