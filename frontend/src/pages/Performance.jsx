// React implementation of the supplied AJIN ON screen; source layout and business calculations preserved.
import React from "react";
import {PageComponent,styleObject} from "../runtime/PageComponent.jsx";

export default class Performance extends PageComponent {
  constructor(props) {
    super(props);
    this.state = { admin: true, entity: 'ajin', item: 'incoming', data: {}, refs: {}, scores: {} };
  }
  renderVals() {
    var self = this, st = this.state, admin = st.admin;
    var entities = [['ajin', '아진산업', 'D017'], ['ajincar', '아진카인텍', 'KX8Z'], ['ajajin', 'AJ아진', 'RTZM'], ['ajinelec', '아진전자부품', 'KVJ5']];
    var ent = entities.filter(function (e) { return e[0] === st.entity; })[0];
    var items = [
      { id: 'incoming', name: '입고불량', short: '입고불량', max: 10, desc: '상·하반기 각 5점 · 월별 PPM', kind: 'table' },
      { id: 'claim', name: '클레임비용', short: '클레임', max: 35, desc: '보증 1년 15 · 2년 10 · 3년 10', kind: 'table' },
      { id: 'audit', name: '현장평가', short: '현장평가', max: 30, desc: '공장별 최종점수 자동 집계', kind: 'audit' },
      { id: 'outsourcing', name: '외주사관리', short: '외주사관리', max: 15, desc: '외주사 평가 · 개선조치', kind: 'score' },
      { id: 'qm', name: '품질경영', short: '품질경영', max: 10, desc: '운영실적 · 수상 · 스마트공장', kind: 'score' }
    ];
    var item = items.filter(function (x) { return x.id === st.item; })[0];
    var months = [[2025, 9], [2025, 10], [2025, 11], [2025, 12], [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7], [2026, 8]];
    var key = function (row, i) { return st.entity + '|' + st.item + '|' + row + '|' + i; };
    var num = function (v) { if (v === '' || v === undefined || v === null) return null; var n = Number(v); return isFinite(n) ? n : null; };
    var val = function (row, i) { return num(st.data[key(row, i)]); };
    var sum = function (row, a, b) { var t = 0; for (var i = a; i < b; i++) t += val(row, i) || 0; return t; };
    var f0 = function (n) { return n === null ? '—' : Math.round(n).toLocaleString('ko-KR'); };
    var f2 = function (n) { return n === null || !isFinite(n) ? '—' : n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var monthFilled = function (rowIds, entity, itemId) {
      var c = 0;
      for (var i = 0; i < 12; i++) {
        var ok = rowIds.every(function (r) { var v = st.data[entity + '|' + itemId + '|' + r + '|' + i]; return v !== undefined && v !== ''; });
        if (ok) c++;
      }
      return c;
    };
    var rowDefs = {
      incoming: [['receipts', '입고수량'], ['domestic', '국내불량'], ['kd', 'KD입고불량']],
      claim: [['receipts', '입고금액'], ['claimTotal', '클레임 합계'], ['w1', '보증 1년'], ['w2', '보증 2년'], ['w3', '보증 3년']]
    };

    var cols = [], rows = [], summaryCards = [], calcNote = '';
    var thBase = 'padding: 10px 6px; font-weight: 700; text-align: center; white-space: nowrap; border-bottom: 1px solid #e3e8ef; ';
    var tdBase = 'padding: 6px; text-align: center; border-bottom: 1px solid #edf0f4; ';
    var labelStyle = function (bg) { return 'position: sticky; left: 0; z-index: 1; background: ' + bg + '; padding: 10px; text-align: center; font-weight: 700; white-space: nowrap; border-right: 1px solid #e3e8ef; border-bottom: 1px solid #edf0f4'; };
    if (item.kind === 'table') {
      var isInc = item.id === 'incoming';
      months.forEach(function (m, i) {
        cols.push({ type: 'm', i: i, label: String(m[0]).slice(2) + '년 ' + m[1] + '월', style: thBase + 'background: #f5f7fa' });
        if (isInc && i === 5) cols.push({ type: 'h', a: 0, b: 6, label: '상반기', style: thBase + 'background: #e8f0fe; color: #1d4ed8' });
      });
      cols.push(isInc ? { type: 'h', a: 6, b: 12, label: '하반기', style: thBase + 'background: #e7f5ee; color: #1f7a55' } : { type: 'h', a: 0, b: 12, label: '합계', style: thBase + 'background: #e8f0fe; color: #1d4ed8' });
      var halfBg = function (c) { return c.a === 6 ? '#f1faf5' : '#f3f7fe'; };
      rowDefs[item.id].forEach(function (rd) {
        rows.push({
          label: rd[1], labelStyle: labelStyle('#ffffff'),
          cells: cols.map(function (c) {
            if (c.type === 'm') return { isInput: true, isText: false, value: st.data[key(rd[0], c.i)] ?? '', aria: rd[1] + ' ' + c.label, style: tdBase, set: function (e) { var d = Object.assign({}, st.data); d[key(rd[0], c.i)] = e.target.value; self.setState({ data: d }); } };
            return { isInput: false, isText: true, text: f0(sum(rd[0], c.a, c.b)), style: tdBase + 'font-weight: 700; background: ' + halfBg(c) };
          })
        });
      });
      if (isInc) {
        var ppm = function (a, b) { var r = sum('receipts', a, b); return r > 0 ? (sum('domestic', a, b) + sum('kd', a, b)) / r * 1e6 : null; };
        rows.push({
          label: 'PPM', labelStyle: labelStyle('#f5f7fa'),
          cells: cols.map(function (c) {
            var v = c.type === 'm' ? ppm(c.i, c.i + 1) : ppm(c.a, c.b);
            return { isInput: false, isText: true, text: f2(v), style: tdBase + 'font-weight: 700; color: #0b2343; background: ' + (c.type === 'm' ? '#f9fafc' : halfBg(c)) };
          })
        });
        [['상반기', 0, 6, '#f3f7fe', '#cddcf5', '#1d4ed8'], ['하반기', 6, 12, '#f1faf5', '#c7e6d5', '#1f7a55']].forEach(function (h) {
          var r = sum('receipts', h[1], h[2]), dft = sum('domestic', h[1], h[2]) + sum('kd', h[1], h[2]);
          summaryCards.push({ title: h[0] + ' · 5점', ink: h[5], box: 'border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: ' + h[3] + '; border: 1px solid ' + h[4], stats: [{ label: '입고수량', value: f0(r) }, { label: '총 불량', value: f0(dft) }, { label: 'PPM', value: f2(ppm(h[1], h[2])) }, { label: '점수', value: '산식 확인 대기' }] });
        });
        calcNote = '자동 계산: 월별·반기별 PPM = (국내불량 + KD입고불량) ÷ 입고수량 × 1,000,000. 반기 PPM은 월별 PPM 평균이 아니라 반기 전체 합계로 계산합니다. 점수는 운영안의 구간·반올림 기준 확인 후 연결.';
      } else {
        var tot = function (r) { return sum(r, 0, 12); };
        var rec = tot('receipts');
        var rate = function (r) { return rec > 0 ? tot(r) / rec * 100 : null; };
        summaryCards.push({ title: '연간 합계', ink: '#1d4ed8', box: 'border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #f3f7fe; border: 1px solid #cddcf5', stats: [{ label: '입고금액', value: f0(rec) }, { label: '클레임 합계', value: f0(tot('claimTotal')) }, { label: '종합 변제율', value: rate('claimTotal') === null ? '—' : rate('claimTotal').toFixed(5) + '%' }, { label: '총점 / 35', value: '[점수]' }] });
        summaryCards.push({ title: '보증연차별 점수', ink: '#1f7a55', box: 'border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #f1faf5; border: 1px solid #c7e6d5', stats: [{ label: '1년 · 15점', value: '[점수]' }, { label: '2년 · 10점', value: '[점수]' }, { label: '3년 · 10점', value: '[점수]' }, { label: '적용 입고금액', value: '[금액]' }] });
        calcNote = '자동 계산: 보증 1년 점수 = 15 − (변제율 ÷ 기준값 × 7.5), 보증 2·3년 = 10 − (변제율 ÷ 기준값 × 5). 적용 입고금액은 최근 1년과 최근 3년 평균 중 큰 값 (전년·전전년 입고금액 별도 입력).';
      }
    }

    var itemCards = items.map(function (x) {
      var on = x.id === st.item;
      var status, good;
      if (x.kind === 'table') { var n = monthFilled(rowDefs[x.id].map(function (r) { return r[0]; }), st.entity, x.id); status = '월별 입력 ' + n + ' / 12'; good = n === 12; }
      else if (x.kind === 'audit') { status = '자동 집계'; good = true; }
      else { var sv = st.scores[st.entity + '|' + x.id]; status = sv ? sv + '점 입력' : '점수 미입력'; good = !!sv; }
      return {
        name: x.name, max: x.max, desc: x.desc, status: status,
        statusStyle: 'align-self: flex-start; font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; background: ' + (good ? '#e7f5ee' : '#f0f2f5') + '; color: ' + (good ? '#1f7a55' : '#4a5566'),
        style: 'display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: #141a23; cursor: pointer; border-radius: 14px; padding: 14px 16px; background: ' + (on ? '#eef4ff' : '#ffffff') + '; border: ' + (on ? '2px solid #1d4ed8' : '1px solid #e3e8ef'),
        pick: function () { self.setState({ item: x.id }); }
      };
    });

    var auditSites = { ajin: [['본사', '2026.09 → 2027 이월', '해당 없음'], ['경산', '2024.07.24', '해당 연도 평가 없음'], ['구어 · 입실 · 준텍', '2025년 평가', '해당 연도 평가 없음']], ajincar: [['건천', '2025.02.12', '해당 연도 평가 없음'], ['모화', '2025.05.28', '해당 연도 평가 없음']], ajajin: [['AJ아진', '2024.04.18', '해당 연도 평가 없음']], ajinelec: [['아진전자부품', '2025.08.26', '해당 연도 평가 없음']] };
    var refKey = st.entity + '|' + st.item;
    var on = admin;
    return {
      admin: admin, lock: !admin,
      adminPressed: on ? 'true' : 'false',
      toggleAdmin: function () { self.setState({ admin: !admin }); },
      switchTrack: 'width: 40px; height: 24px; border-radius: 12px; position: relative; display: inline-block; background: ' + (on ? '#1d4ed8' : '#cfd5de'),
      switchKnob: 'position: absolute; top: 3px; left: ' + (on ? '19px' : '3px') + '; width: 18px; height: 18px; border-radius: 9px; background: #ffffff',
      entityTabs: entities.map(function (e) { var sel = e[0] === st.entity; return { name: e[1], code: e[2], pick: function () { self.setState({ entity: e[0] }); }, style: 'border: 1px solid ' + (sel ? '#0b2343' : '#d5dbe4') + '; background: ' + (sel ? '#0b2343' : '#ffffff') + '; color: ' + (sel ? '#ffffff' : '#2b3644') + '; border-radius: 10px; padding: 10px 18px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer' }; }),
      entityName: ent[1],
      itemCards: itemCards,
      itemTitle: item.name + (item.kind === 'table' ? ' 월별 실적 입력' : item.kind === 'audit' ? ' 실적' : ' 점수 입력'),
      itemShort: item.short, itemMax: item.max,
      isTable: item.kind === 'table', isScore: item.kind === 'score', isAudit: item.kind === 'audit',
      refValue: st.refs[refKey] || '',
      setRef: function (e) { var r = Object.assign({}, st.refs); r[refKey] = e.target.value; self.setState({ refs: r }); },
      cols: cols, rows: rows, summaryCards: summaryCards, calcNote: calcNote,
      scoreValue: st.scores[refKey] ?? '',
      setScore: function (e) { var s = Object.assign({}, st.scores); s[refKey] = e.target.value; self.setState({ scores: s }); },
      scorePlaceholder: item.id === 'qm' ? '품질경영철학, 수상실적, 스마트공장 등 근거를 적고 파일을 첨부합니다' : '외주사 평가 실적, 개선조치 현황 등 근거를 적고 파일을 첨부합니다',
      auditRows: (auditSites[st.entity] || []).map(function (a) { return { site: a[0], date: a[1], score: a[2] }; })
    };
  }

  render(){ const v=this.renderVals(); const memoKey=this.state.entity+"|"+this.state.item;v.memoValue=this.state.memos?.[memoKey]??"";v.setMemo=e=>this.setState({memos:{...(this.state.memos||{}),[memoKey]:e.target.value}}); return React.createElement(React.Fragment,null,"\n",React.createElement(React.Fragment,null,"\n","\n","\n",React.createElement("style",{}, "\nbody{margin:0;background:#f5f7fa}\na{color:#1d4ed8;text-decoration:none}a:hover{color:#1e3a8a}\n"),"\n"),"\n",React.createElement("div",{"style":styleObject("min-height: 1320px; background: #f5f7fa; font-family: 'Noto Sans KR', sans-serif; color: #141a23")}, "\n",React.createElement("header",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 22px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("display: flex; align-items: center; gap: 10px; color: #0b2343"),"data-bound":""}, React.createElement("span",{"style":styleObject("width: 34px; height: 34px; border-radius: 9px; background: #0b2343; color: #ffffff; display: grid; place-items: center; font-weight: 900; font-size: 13px")}, "AJ"),React.createElement("span",{"style":styleObject("font-size: 20px; font-weight: 900")}, "AJIN ON")),"\n",React.createElement("span",{"style":styleObject("width: 1px; height: 18px; background: #d9dee6"),"aria-hidden":"true"}),"\n",React.createElement("button",{"type":"button","onClick":v.toggleAdmin,"aria-pressed":v.adminPressed,"style":styleObject("display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 6px 0; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; color: #2b3644"),"data-bound":(typeof v.toggleAdmin === "function" ? "1" : "")}, "본사 관리자\n",React.createElement("span",{"style":styleObject(v.switchTrack)}, React.createElement("span",{"style":styleObject(v.switchKnob)})),"\n"),"\n",React.createElement("nav",{"aria-label":"주요 업무","style":styleObject("display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px")}, "\n",React.createElement("a",{"href":"Main.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "홈"),"\n",React.createElement("a",{"href":"Qstar.dc.html","style":styleObject("color: #141a23; font-weight: 700; border-bottom: 2px solid #141a23; padding-bottom: 4px"),"data-bound":""}, "품질5스타"),"\n",React.createElement("a",{"href":"FieldAudit.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "현장평가"),"\n",React.createElement("a",{"href":"Internal.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "내부 현장평가"),"\n",React.createElement("a",{"href":"SQ.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "SQ평가"),"\n",React.createElement("a",{"href":"IATF.dc.html","style":styleObject("color: #4a5566"),"data-bound":""}, "IATF 16949"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "원가절감"),"\n",React.createElement("a",{"href":"#","style":styleObject("color: #4a5566"),"data-bound":""}, "교육"),"\n"),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 14px; color: #4a5566")}, "품질경영팀 · 홍길동"),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("background: #ffffff; border-bottom: 1px solid #eceff3")}, "\n",React.createElement("div",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 0; display: flex; flex-direction: column; gap: 18px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 6px")}, React.createElement("span",{"style":styleObject("font-size: 13px; color: #66758a")}, "홈 › 품질5스타 › 실적 관리"),React.createElement("h1",{"style":styleObject("margin: 0; font-size: 30px; font-weight: 900; letter-spacing: -0.02em")}, "품질5스타 실적 관리")),"\n",React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 13px; color: #4a5566; background: #f0f2f5; border-radius: 9px; padding: 9px 14px")}, "2026년 평가 · 실적 반영 2025.09 ~ 2026.08"),"\n"),"\n",React.createElement("nav",{"aria-label":"법인 선택","style":styleObject("display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 18px")}, "\n",(v.entityTabs ?? []).map((e,i9)=>React.createElement(React.Fragment,{key:i9},"\n",React.createElement("button",{"type":"button","onClick":e.pick,"style":styleObject(e.style),"data-bound":(typeof e.pick === "function" ? "1" : "")}, String(e.name ?? "")+" ",React.createElement("span",{"style":styleObject("font-weight: 400; opacity: 0.7")}, e.code)),"\n")),"\n"),"\n"),"\n"),"\n\n",React.createElement("main",{"style":styleObject("max-width: 1200px; margin: 0 auto; padding: 28px 24px 64px; display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start")}, "\n\n",React.createElement("aside",{"aria-label":"평가 항목","style":styleObject("flex: 1 1 240px; max-width: 280px; display: flex; flex-direction: column; gap: 10px")}, "\n",React.createElement("div",{"style":styleObject("background: #0b2343; color: #ffffff; border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; gap: 4px")}, "\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #b7c6da")}, String(v.entityName ?? "")+" 2026 종합"),"\n",React.createElement("div",{"style":styleObject("display: flex; align-items: baseline; gap: 6px")}, React.createElement("b",{"style":styleObject("font-size: 30px; font-weight: 900")}, "[총점]"),React.createElement("span",{"style":styleObject("font-size: 13px; color: #b7c6da")}, "/ 100점")),"\n"),"\n",(v.itemCards ?? []).map((it,i10)=>React.createElement(React.Fragment,{key:i10},"\n",React.createElement("button",{"type":"button","onClick":it.pick,"style":styleObject(it.style),"data-bound":(typeof it.pick === "function" ? "1" : "")}, "\n",React.createElement("span",{"style":styleObject("display: flex; align-items: center; gap: 8px")}, React.createElement("b",{"style":styleObject("font-size: 15px")}, it.name),React.createElement("span",{"style":styleObject("margin-left: auto; font-size: 12px; font-weight: 700; color: #1d4ed8; background: #e8f0fe; border-radius: 8px; padding: 2px 8px")}, String(it.max ?? "")+"점")),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, it.desc),"\n",React.createElement("span",{"style":styleObject(it.statusStyle)}, it.status),"\n"),"\n")),"\n"),"\n\n",React.createElement("section",{"aria-label":"항목 입력","style":styleObject("flex: 999 1 640px; min-width: 0; background: #ffffff; border: 1px solid #e3e8ef; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 18px")}, "\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; align-items: center; gap: 10px")}, "\n",React.createElement("h2",{"style":styleObject("margin: 0; font-size: 20px; font-weight: 900")}, v.itemTitle),"\n",React.createElement("span",{"style":styleObject("font-size: 13px; color: #66758a")}, String(v.entityName ?? "")+" · 2026년"),"\n",(v.admin ? React.createElement(React.Fragment,null,React.createElement("button",{"type":"button","style":styleObject("margin-left: auto; border: 0; background: #1d4ed8; color: #ffffff; border-radius: 10px; padding: 10px 18px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer"),"data-bound":""}, "실적 저장")) : null),"\n"),"\n\n",(v.isTable ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 12px")}, "\n",React.createElement("label",{"style":styleObject("flex: 1 1 260px; display: flex; align-items: center; gap: 12px; background: #f3f7fe; border: 1px solid #cddcf5; border-radius: 12px; padding: 14px 16px")}, "\n",React.createElement("span",{"style":styleObject("display: flex; flex-direction: column; gap: 3px; flex: 1")}, React.createElement("b",{"style":styleObject("font-size: 14px")}, "2026년 "+String(v.itemShort ?? "")+" 기준값"),React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a")}, "운영안 또는 고객사 통보 기준값 · 연 1회")),"\n",React.createElement("input",{"type":"number","step":"0.0001","placeholder":"예: 5.65","value":v.refValue,"onChange":v.setRef,"disabled":v.lock,"style":styleObject("width: 120px; height: 42px; border: 1px solid #9fb8e6; border-radius: 10px; padding: 0 12px; font: inherit; font-size: 16px; font-weight: 700; text-align: right; background: #ffffff")}),"\n"),"\n",React.createElement("div",{"style":styleObject("flex: 1 1 260px; display: flex; align-items: center; gap: 12px; border: 1px solid #e3e8ef; border-radius: 12px; padding: 14px 16px")}, "\n",React.createElement("span",{"style":styleObject("font-size: 12px; font-weight: 700; color: #1d4ed8; background: #e8f0fe; border-radius: 12px; padding: 4px 10px; flex: none")}, "직접 입력"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #4a5566; line-height: 1.6")}, "지금은 직접 입력 · 나중에 POP 연동되면 같은 표에 자동으로 채워지고 마지막 수집시각 표시"),"\n"),"\n"),"\n\n",React.createElement("div",{"style":styleObject("overflow-x: auto; border: 1px solid #e3e8ef; border-radius: 12px")}, "\n",React.createElement("table",{"style":styleObject("border-collapse: collapse; min-width: 1240px; width: 100%; font-size: 13px")}, React.createElement("thead",{}, React.createElement("tr",{}, React.createElement("th",{"style":styleObject("position: sticky; left: 0; z-index: 1; background: #eef2f7; padding: 10px; width: 108px; text-align: center; font-weight: 700; border-right: 1px solid #e3e8ef")}, "구분"),(v.cols ?? []).map((c,i11)=>React.createElement(React.Fragment,{key:i11},React.createElement("th",{"style":styleObject(c.style)}, c.label))))),React.createElement("tbody",{}, (v.rows ?? []).map((r,i12)=>React.createElement(React.Fragment,{key:i12},React.createElement("tr",{}, React.createElement("th",{"style":styleObject(r.labelStyle)}, r.label),(r.cells ?? []).map((x,i13)=>React.createElement(React.Fragment,{key:i13},React.createElement("td",{"style":styleObject(x.style)}, "\n",(x.isInput ? React.createElement(React.Fragment,null,React.createElement("input",{"type":"number","min":"0","value":x.value,"onChange":x.set,"disabled":v.lock,"aria-label":x.aria,"style":styleObject("width: 72px; height: 32px; border: 1px solid #d5dbe4; border-radius: 7px; padding: 0 6px; font: inherit; font-size: 12px; text-align: right; background: #ffffff")})) : null),"\n",(x.isText ? React.createElement(React.Fragment,null,x.text) : null),"\n")))))))),"\n"),"\n\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px")}, "\n",(v.summaryCards ?? []).map((s,i14)=>React.createElement(React.Fragment,{key:i14},"\n",React.createElement("div",{"style":styleObject(s.box)}, "\n",React.createElement("b",{"style":styleObject("font-size: 15px; color: "+String(s.ink ?? ""))}, s.title),"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px")}, "\n",(s.stats ?? []).map((t,i15)=>React.createElement(React.Fragment,{key:i15},"\n",React.createElement("span",{"style":styleObject("display: flex; flex-direction: column; gap: 2px")}, React.createElement("span",{"style":styleObject("font-size: 11px; color: #66758a")}, t.label),React.createElement("b",{"style":styleObject("font-size: 15px")}, t.value)),"\n")),"\n"),"\n"),"\n")),"\n"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a; line-height: 1.6; background: #f7f9fc; border: 1px dashed #d5dbe4; border-radius: 10px; padding: 10px 14px")}, v.calcNote),"\n") : null),"\n\n",(v.isScore ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; flex-wrap: wrap; gap: 16px")}, "\n",React.createElement("label",{"style":styleObject("flex: 1 1 240px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 700")}, "점수 ("+String(v.itemMax ?? "")+"점 만점)\n",React.createElement("input",{"type":"number","min":"0","max":v.itemMax,"step":"0.1","value":v.scoreValue,"onChange":v.setScore,"disabled":v.lock,"placeholder":"0 ~ "+String(v.itemMax ?? ""),"style":styleObject("height: 48px; border: 1px solid #d5dbe4; border-radius: 10px; padding: 0 14px; font: inherit; font-size: 18px; font-weight: 700")}),"\n"),"\n",React.createElement("label",{"style":styleObject("flex: 2 1 360px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 700")}, "근거자료 · 메모\n",React.createElement("textarea",{"value":v.memoValue,"onChange":v.setMemo,"disabled":v.lock,"placeholder":v.scorePlaceholder,"style":styleObject("min-height: 120px; border: 1px solid #d5dbe4; border-radius: 10px; padding: 12px 14px; font: inherit; font-size: 14px; font-weight: 400; resize: vertical")}),"\n"),"\n"),"\n",React.createElement("span",{"style":styleObject("font-size: 12px; color: #66758a; line-height: 1.6; background: #f7f9fc; border: 1px dashed #d5dbe4; border-radius: 10px; padding: 10px 14px")}, "지금은 점수를 직접 입력 · 운영안 세부기준이 정리되면 항목별 실적에서 점수가 자동 계산되도록 연결"),"\n") : null),"\n\n",(v.isAudit ? React.createElement(React.Fragment,null,"\n",React.createElement("div",{"style":styleObject("display: flex; flex-direction: column; gap: 10px")}, "\n",React.createElement("span",{"style":styleObject("font-size: 14px; color: #4a5566; line-height: 1.6")}, "현장평가는 따로 입력하지 않습니다. 고객사가 연말에 통보한 ",React.createElement("b",{}, "공장별 최종점수"),"를 현장평가 화면에 등록하면, 그 법인 소속 공장의 평균이 여기에 자동으로 들어옵니다."),"\n",React.createElement("div",{"style":styleObject("border: 1px solid #e3e8ef; border-radius: 12px; overflow: hidden")}, "\n",(v.auditRows ?? []).map((a,i16)=>React.createElement(React.Fragment,{key:i16},"\n",React.createElement("div",{"style":styleObject("display: grid; grid-template-columns: minmax(0, 1fr) 140px 140px; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid #edf0f4; font-size: 14px")}, "\n",React.createElement("b",{}, a.site),React.createElement("span",{"style":styleObject("color: #66758a")}, a.date),React.createElement("span",{"style":styleObject("text-align: right; font-weight: 700")}, a.score),"\n"),"\n")),"\n"),"\n",React.createElement("a",{"href":"FieldAudit.dc.html","style":styleObject("align-self: flex-start; font-size: 14px; font-weight: 700"),"data-bound":""}, "현장평가 화면에서 점수 등록 ›"),"\n"),"\n") : null),"\n"),"\n"),"\n"),"\n"); }
}
