// cf-mediathek-mrss 1.2.0 — MRSS with variant exclusion and canonical deduplication.
const VERSION = '1.3.0';
const PROVIDERS = {
  arte: { label: 'ARTE', query: '!ARTE >30' },
  '3sat': { label: '3sat', query: '!3sat >30' },
  ndr: { label: 'NDR', query: '!NDR Doku >30' },
  wdr: { label: 'WDR', query: '!WDR Doku >30' },
  swr: { label: 'SWR', query: '!SWR Doku >30' },
  br: { label: 'BR', query: '!BR Wissen >20' },
  mdr: { label: 'MDR', query: '!MDR Doku >30' },
  rbb: { label: 'rbb', query: '!rbb >30' },
  hr: { label: 'hr', query: '!hr >30' },
  kika: { label: 'KiKA', query: '!KiKA' },
  zdfneo: { label: 'ZDFneo', query: '!ZDFneo' },
  'ard-alpha': { label: 'ARD-alpha', query: '!ARD-alpha >20' },
};
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const decode = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_,n)=>{ const c=Number(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):n);return Number.isFinite(c)&&c>0&&c<=0x10ffff?String.fromCodePoint(c):'';})
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'");
const attr = (text, n) => (text.match(new RegExp('\\b'+n+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']','i'))||[])[1] || '';
const tag = (xml,n) => decode((xml.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+n+'>','i'))||[])[1] || '').trim();
const element = (xml,n) => (xml.match(new RegExp('<'+n+'\\b[^>]*>','i'))||[])[0] || '';
const validHttp = v => {try {const u=new URL(decode(v));return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return ''}};
const mediaExt = /\.(?:mp4|m4v|webm|m3u8|mpd)(?:[?#]|$)/i;
const integer = v => /^\d+$/.test(String(v ?? '').trim()) && Number(v)>0 && Number(v)<=9999 ? Number(v) : null;
const seasonInt = v => /^\d+$/.test(String(v ?? '').trim()) && Number(v)>=0 && Number(v)<=9999 ? Number(v) : null;
const pad2 = n => String(n).padStart(2,'0');
function parseDuration(v) {
  const value=String(v||'').trim();
  if(/^\d{1,6}$/.test(value))return Number(value)<=864000?Number(value):null;
  if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value))return null;
  const p=value.split(':').map(Number);
  if(p.slice(1).some(x=>x>59))return null;
  const n=p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];
  return n<=864000?n:null;
}
const clean = (s, max=125) => String(s??'').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim().slice(0,max).replace(/[. ]+$/g,'').trim();
const generic = /^(?:doku(?:mentation)?|reportage|politik|gesellschaft|nachrichten|news|videos?|filme?|serien?|sonstiges|wissen|history|geschichte|kultur|natur|sport|aktuelles|podcast)$/i;
const lang = value => {
  const x=String(value||'').trim().toLowerCase();
  if (/^(de|de-de|deutsch|german|ger)$/.test(x)) return 'de';
  if (/^(en|en-us|en-gb|english|eng)$/.test(x)) return 'en';
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(x)) return x.split('-')[0];
  return null;
};

// Variant detection is deliberately based on explicit presentation labels, not words
// somewhere in a synopsis (e.g. an interview about audiodescription).
// A title about accessibility is not necessarily an accessibility *edition*.
const bracketVersion = /[\[(]\s*(?:(?:mit|inklusive)\s+)?(?:audiodeskription|audiodescription|h[oö]rfassung|h[oö]rfilm|geb[aä]rdensprache|untertiteln?|untertitel(?:\s+f[uü]r\s+h[oö]rgesch[aä]digte)?|originalfassung|originalversion|originalton|originalsprache|ov|omu|of|ad|ut|cc|sdh|dgs)\s*[\])]/i;
const abbreviations = /(?:\s+[-–—|:]\s*(?:ov|omu|of|ad|ut|cc|sdh|dgs)\s*$|\b(?:fassung|version|sprache|ton)\s*[:=-]\s*(?:ov|omu|of|ad|ut|sdh|dgs)\b)/i;
function explicitlyLabeled(text) {
  if(!text)return false;
  if(bracketVersion.test(text) || abbreviations.test(text))return true;
  const normalized=text.trim();
  const suffix=/\b(?:mit\s+)?(?:audiodeskription|audiodescription|h[oö]rfassung|h[oö]rfilm|geb[aä]rdensprache|originalfassung|originalversion|originalsprache|originalton|om[uü]|untertitel(?:\s+f[uü]r\s+h[oö]rgesch[aä]digte)?|f[uü]r\s+h[oö]rgesch[aä]digte|mit\s+untertiteln?)\s*$/i;
  const prefixed=/^(?:(?:version|fassung)\s*[:=-]\s*)?(?:h[oö]rfassung|audiodeskription|geb[aä]rdensprache|originalfassung|originalversion|mit untertiteln|ov|omu|of|ad|ut|sdh|dgs)\s*[:–—-]/i;
  if(prefixed.test(normalized))return true;
  if(suffix.test(normalized)) {
    // "Film über Originalton" refers to a topic, not necessarily to an edition.
    const before=normalized.replace(suffix,'').trim();
    return !/\b(?:u[eü]ber|zum|zur|des|der|von|im|in|mit)\s*$/i.test(before);
  }
  return false;
}
const VARIANT_FLAGS = [
  'audioversion','audioVersion','audioDescription','audiodescription','signlanguage','signLanguage',
  'isAudioDescribed','isSignLanguage','isHearingImpaired','hearingImpaired'
];
const trueFlag = value => /^(?:true|1|yes|ja)$/i.test(value.trim());
function classifyVariant(block, originalTitle) {
  if(VARIANT_FLAGS.some(k=>trueFlag(tag(block,k)))) return 'accessibility';
  const title=String(originalTitle||'');
  const marked=[title,tag(block,'category'),tag(block,'media:category'),tag(block,'variant'),tag(block,'version')];
  for(const value of marked) {
    if(!value)continue;
    if(explicitlyLabeled(value))return 'labeled-edition';
    // A category equal to a variant label is structural metadata, not a topic.
    if(value!==title && /^(?:originalfassung|originalversion|originalton|ov|omu|h[oö]rfassung|audiodeskription|audiodescription|geb[aä]rdensprache|untertitel f[uü]r h[oö]rgesch[aä]digte|sdh|dgs)$/i.test(value.trim()))return 'variant-category';
  }
  const desc=tag(block,'description')||tag(block,'summary');
  if(/^(?:(?:video|film|sendung):?\s*)?(?:h[oö]rfassung|audiodeskription|mit audiodeskription|geb[aä]rdensprache|originalfassung|originalversion|mit untertiteln)\s*[:–—-]/i.test(desc))return 'labeled-description';
  return null;
}
function normalizeText(value) {
  return decode(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[([]\s*(?:ov|omu|of|ad|ut|sdh|dgs|hd|sd|fullhd|1080p|720p)\s*[)\]]/gi,'')
    .replace(/\s+[-–—|:]\s+(?:ov|omu|of|ad|ut|sdh|dgs|hd|sd|fullhd|1080p|720p)\s*$/gi,'')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
const dailyTitle=/^(?:tagesschau|heute journal|heute|abendschau|aktuelle stunde|nachrichten|wetter|sportnachrichten|mittagsmagazin|morgenmagazin|journal|rundschau|folgen? \d+|episode \d+)(?:\b|$)/i;
function normalizedUrl(value) {
  if(!value)return '';
  try{
    const u=new URL(value);u.hash='';
    for(const k of [...u.searchParams.keys()])if(/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/i.test(k))u.searchParams.delete(k);
    return u.href.toLowerCase().replace(/\/$/,'');
  }catch{return ''}
}
function dedupKey(x) {
  const series=normalizeText(x.series||'');
  // Episode identity beats minor formatting differences of a title.
  if(series && x.episode && x.season!==null)return `episode:${series}:${x.season}:${x.episode}`;
  const title=normalizeText(x.originalTitle);
  const episodeWithoutSeason=series&&x.episode?`:${x.episode}`:'';
  const date=Number.isFinite(Date.parse(x.date)) ? new Date(x.date).toISOString().slice(0,13) : ''; // hour: daily programmes can air more than once
  // Daily shows / generic "Folge 1" require a date to avoid merging new editions.
  if((dailyTitle.test(title)||title.length<8) && !x.season) {
    return `daily:${series||normalizeText(x.category)||normalizeText(x.provider)}:${title}${episodeWithoutSeason}:${date||normalizedUrl(x.link)||x.guid}`;
  }
  if(title) {
    const ambiguous=title.length<18||/^(?:folge|episode|teil|part)\s*\d+\b/.test(title);
    const context=(series&&x.episode)||ambiguous ? (series||normalizeText(x.category)||normalizeText(x.provider))+':' : '';
    return `title:${context}${title}${episodeWithoutSeason}`;
  }
  return `url:${normalizedUrl(x.link||x.playable)||x.guid}`;
}
function itemQuality(x) {
  // Prefer entries with a directly playable URL, thumbnail and fuller metadata.
  // No claim is made about audio quality or video resolution.
  return (x.playable?100:0)+(x.thumb?15:0)+(x.languageSource==='source'?5:0)
    +Math.min(x.description.length,600)/100+(x.series?2:0);
}
function mergeItems(items) {
  const byKey=new Map();const urlKeys=new Map();let duplicates=0;
  for(const item of items) {
    const key=dedupKey(item);
    const url=normalizedUrl(item.link||item.playable);
    const existingKey=byKey.has(key)?key:(url&&urlKeys.has(url)?urlKeys.get(url):null);
    if(existingKey){
      duplicates++;
      const old=byKey.get(existingKey);
      if(itemQuality(item)>itemQuality(old))byKey.set(existingKey,item);
      if(url)urlKeys.set(url,existingKey);
    }else{byKey.set(key,item);if(url)urlKeys.set(url,key);}
  }
  return {items:[...byKey.values()],duplicates};
}

function episodeInfo(rawTitle, rawDescription, block) {
  const seasonTags=['emby:season','tv:season','itunes:season','seasonNumber','season'];
  const episodeTags=['emby:episode','tv:episode','itunes:episode','episodeNumber','episode'];
  let season=seasonTags.map(k=>seasonInt(tag(block,k))).find(n=>n!==null) ?? null;
  let episode=episodeTags.map(k=>integer(tag(block,k))).find(Boolean) || null;
  let marker = null;
  for(const source of [rawTitle, rawDescription.slice(0,320)]) {
    const m=source.match(/\bS(?:taffel\s*)?(\d{1,3})\s*[.\-_ ]*E(?:pisode\s*)?(\d{1,4})\b/i)
      || source.match(/\bStaffel\s*(\d{1,3})\s*[,.:\-/ ]+\s*(?:Folge|Episode|Ep\.)\s*(\d{1,4})\b/i)
      || source.match(/\b(\d{1,3})\s*[xX]\s*(\d{1,4})\b/);
    if(m){if(season===null)season=seasonInt(m[1]); episode ||= integer(m[2]); marker=m[0];break;}
  }
  // A bare "Folge 3" is useful metadata but does not justify inventing Season 01.
  if(!episode){const m=rawTitle.match(/\b(?:Folge|Episode|Ep\.)\s*(\d{1,4})\b/i);if(m)episode=integer(m[1]);}
  return {season,episode,marker};
}

function enrich(x, block, mode) {
  const number = episodeInfo(x.originalTitle,x.description,block);
  const rawSeries=tag(block,'emby:series')||tag(block,'tv:series')||tag(block,'seriesName')||tag(block,'series')||tag(block,'show');
  const category=tag(block,'category'); // MediathekViewWeb uses category for "Thema".
  let series=clean(rawSeries);
  if(!series && number.episode && category && !generic.test(category.trim()))series=clean(category);
  if(!series && number.episode && number.marker && x.originalTitle.toLowerCase().includes(number.marker.toLowerCase())){
    const prefix=x.originalTitle.slice(0,x.originalTitle.toLowerCase().indexOf(number.marker.toLowerCase())).replace(/[\s:–—-]+$/,'');
    if(prefix && prefix.length<90)series=clean(prefix);
  }
  let episodeTitle=x.originalTitle;
  if(number.marker && episodeTitle.toLowerCase().includes(number.marker.toLowerCase()))episodeTitle=episodeTitle.replace(number.marker,'').replace(/^[\s:–—-]+|[\s:–—-]+$/g,'').trim();
  else if(number.episode)episodeTitle=episodeTitle.replace(new RegExp('^\\s*(?:Folge|Episode|Ep\\.)\\s*'+number.episode+'\\s*[:–—.-]?\\s*','i'),'')||x.originalTitle;
  if(series && episodeTitle.toLowerCase().startsWith(series.toLowerCase())) {
    episodeTitle=episodeTitle.slice(series.length).replace(/^[\s:–—-]+/,'').trim() || x.originalTitle;
  }
  const sxx = number.season!==null && number.episode ? `S${pad2(number.season)}E${pad2(number.episode)}` : '';
  const inferredTitle = (series && sxx) ? `${series} - ${sxx} - ${episodeTitle}` :
    (series && number.episode) ? `${series} - Folge ${number.episode}${episodeTitle.toLowerCase()===`folge ${number.episode}`?'':` - ${episodeTitle}`}` :
    (sxx ? `${sxx} - ${episodeTitle}` : x.originalTitle);
  // This names a prospective .strm file; it does NOT create the file or validate playback.
  const baseName=clean(inferredTitle,190) || 'Unbenannt';
  const fileName=baseName+'.strm';
  const relativePath=series && number.season!==null && number.episode
    ? `${clean(series)}/Season ${pad2(number.season)}/${fileName}`
    : series ? `${clean(series)}/${fileName}` : fileName;
  const reportedLanguage=lang(tag(block,'dc:language')||tag(block,'language')||tag(block,'media:language')||attr(element(block,'media:content'),'lang'));
  const language=reportedLanguage || 'de'; // Assumption for German-targeted catalog; NOT a verified audio track.
  const languageSource=reportedLanguage ? 'source' : 'assumed';
  return {...x,...number,series:series||null,episodeTitle,displayTitle:mode==='emby'?baseName:x.originalTitle,filename:fileName,relativePath,language,languageSource,category:category||null};
}

function parse(xml,provider,mode='emby') {
  const blocks=[...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map(x=>x[2]);
  let filteredVariants=0;
  const items=blocks.map(b=>{
    const originalTitle=tag(b,'title');
    if(classifyVariant(b,originalTitle)) {filteredVariants++;return null;}
    const description=tag(b,'description')||tag(b,'summary')||tag(b,'media:description')||tag(b,'content');
    const enclosure=element(b,'enclosure');
    const media=element(b,'media:content');
    const plainLink=validHttp(tag(b,'link')||attr((b.match(/<link\s[^>]*\/?\s*>/i)||[])[0]||'','href'));
    const raw=validHttp(attr(enclosure,'url')||attr(media,'url'));
    const mime=attr(enclosure,'type')||attr(media,'type');
    const playable=raw && (mediaExt.test(raw)||/^video\//i.test(mime)||/^(application\/dash\+xml|application\/vnd\.apple\.mpegurl)$/i.test(mime)) ? raw : '';
    const thumb=validHttp(attr(element(b,'media:thumbnail'),'url')||attr(element(b,'itunes:image'),'href'));
    const link=validHttp(tag(b,'websiteUrl')) || plainLink;
    const guid=tag(b,'guid')||tag(b,'id')||link||raw;
    const date=tag(b,'pubDate')||tag(b,'published')||tag(b,'updated');
    const durationSeconds=parseDuration(attr(media,'duration')||tag(b,'itunes:duration')||tag(b,'duration'));
    return enrich({originalTitle,description,link,guid,playable,thumb,date,provider,durationSeconds},b,mode);
  }).filter(x=>x && x.originalTitle && (x.link||x.playable));
  return {items,filteredVariants};
}
function mimeOf(link) {
  if(/\.mpd(?:[?#]|$)/i.test(link))return 'application/dash+xml';
  if(/\.m3u8(?:[?#]|$)/i.test(link))return 'application/vnd.apple.mpegurl';
  if(/\.webm(?:[?#]|$)/i.test(link))return 'video/webm';
  return 'video/mp4';
}
function xmlFeed(items,title,base) {
  const body=items.map(x=>`<item><title>${esc(x.displayTitle)}</title><guid isPermaLink="false">${esc(x.guid)}</guid>${x.link?`<link>${esc(x.link)}</link>`:''}<description>${esc(x.description)}</description>${Number.isFinite(Date.parse(x.date))?`<pubDate>${new Date(x.date).toUTCString()}</pubDate>`:''}<category>${esc(x.provider)}</category>${x.category?`<category>${esc(x.category)}</category>`:''}<dc:language>${esc(x.language)}</dc:language><emby:languageSource>${x.languageSource}</emby:languageSource><emby:audioVerified>false</emby:audioVerified><emby:filename>${esc(x.filename)}</emby:filename><emby:relativePath>${esc(x.relativePath)}</emby:relativePath>${x.series?`<emby:series>${esc(x.series)}</emby:series>`:''}${x.season!==null?`<emby:season>${x.season}</emby:season>`:''}${x.episode?`<emby:episode>${x.episode}</emby:episode>`:''}<media:title>${esc(x.displayTitle)}</media:title>${x.thumb?`<media:thumbnail url="${esc(x.thumb)}"/>`:''}${x.playable?`<enclosure url="${esc(x.playable)}" type="${mimeOf(x.playable)}"/><media:content url="${esc(x.playable)}" type="${mimeOf(x.playable)}" medium="video"/>`:''}</item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:emby="urn:cf-mediathek-mrss:emby:1"><channel><title>${esc(title)}</title><link>${esc(base)}</link><description>Aggregierter Mediathek-Feed; Audio-Sprache nicht verifiziert; STRM-Dateinamen sind Vorschläge.</description><language>de-DE</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${body}</channel></rss>`;
}

function filtersFrom(p) {
  const o={q:(p.get('q')||'').trim(),category:(p.get('category')||'').trim(),
    language:p.get('language')||'',languageSource:p.get('languageSource')||'',
    playableOnly:p.get('playableOnly')||'false',sort:p.get('sort')||'date',
    order:p.get('order')||'desc',from:p.get('from')||'',to:p.get('to')||'',
    minDuration:p.get('minDuration')||'',maxDuration:p.get('maxDuration')||''};
  if(o.q.length>200||o.category.length>100)return {error:'q max 200 chars, category max 100 chars'};
  if(o.language&&(!lang(o.language)||lang(o.language)!==o.language))return {error:'language must be an ISO language code, e.g. de'};
  if(!['','source','assumed'].includes(o.languageSource))return {error:'Invalid languageSource'};
  if(!['true','false','0','1'].includes(o.playableOnly))return {error:'Invalid playableOnly'};
  if(!['date','title','duration'].includes(o.sort)||!['asc','desc'].includes(o.order))return {error:'Invalid sort or order'};
  const validDate=d=>!d||(/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d);
  if(!validDate(o.from)||!validDate(o.to)||(o.from&&o.to&&o.from>o.to))return {error:'Invalid from/to date'};
  for(const k of ['minDuration','maxDuration'])if(o[k]&&!(/^\d+$/.test(o[k])&&Number(o[k])<=864000))return {error:'Invalid '+k};
  if(o.minDuration&&o.maxDuration&&Number(o.minDuration)>Number(o.maxDuration))return {error:'minDuration exceeds maxDuration'};
  o.playableOnly=['true','1'].includes(o.playableOnly);
  o.minDuration=o.minDuration===''?null:Number(o.minDuration);
  o.maxDuration=o.maxDuration===''?null:Number(o.maxDuration);
  return o;
}
function filterSort(items,o) {
  const terms=normalizeText(o.q).split(/\s+/).filter(Boolean);
  const category=normalizeText(o.category);
  const filtered=items.filter(x=>{
    const all=normalizeText([x.originalTitle,x.description,x.series,x.category,x.provider].join(' '));
    if(!terms.every(t=>all.includes(t)))return false;
    if(category&&!normalizeText(x.category).includes(category))return false;
    if(o.language&&x.language!==o.language)return false;
    if(o.languageSource&&x.languageSource!==o.languageSource)return false;
    if(o.playableOnly&&!x.playable)return false;
    if(o.minDuration!==null&&(x.durationSeconds===null||x.durationSeconds<o.minDuration))return false;
    if(o.maxDuration!==null&&(x.durationSeconds===null||x.durationSeconds>o.maxDuration))return false;
    if(o.from||o.to) {
      const ms=Date.parse(x.date);
      if(!Number.isFinite(ms))return false;
      const date=new Date(ms).toISOString().slice(0,10);
      if(o.from&&date<o.from||o.to&&date>o.to)return false;
    }
    return true;
  });
  return filtered.sort((a,b)=>{
    let n=o.sort==='title'?a.originalTitle.localeCompare(b.originalTitle,'de')
      :o.sort==='duration'?(a.durationSeconds??-1)-(b.durationSeconds??-1)
      :(Date.parse(a.date)||0)-(Date.parse(b.date)||0);
    return (o.order==='asc'?1:-1)*n||a.originalTitle.localeCompare(b.originalTitle,'de');
  });
}
function searchItem(x) {
  return {title:x.originalTitle,displayTitle:x.displayTitle,provider:x.provider,category:x.category,
    description:x.description,date:x.date,series:x.series,season:x.season,episode:x.episode,
    language:x.language,languageSource:x.languageSource,audioVerified:false,durationSeconds:x.durationSeconds,
    link:x.link,playableUrl:x.playable||null,thumbnail:x.thumb||null,
    filename:x.filename,relativePath:x.relativePath};
}
function searchHtml(p,items,stats) {
  const input=(n,label,type='text')=>'<label>'+esc(label)+'<input type="'+type+'" name="'+n+'" value="'+esc(p.get(n)||'')+'"></label>';
  const form='<form action="/search" method="get"><input type="hidden" name="format" value="html">'+
    input('q','Suche')+input('providers','Provider (arte,3sat,ndr)')+
    input('category','Kategorie')+input('language','Sprache (de)')+
    input('from','Von','date')+input('to','Bis','date')+
    input('minDuration','Min. Sekunden','number')+input('maxDuration','Max. Sekunden','number')+
    '<label>Nur direkt abspielbar <select name="playableOnly"><option value="false">Nein</option><option value="true"'+(p.get('playableOnly')==='true'?' selected':'')+'>Ja</option></select></label>'+
    '<label>Sortieren <select name="sort"><option value="date">Datum</option><option value="title"'+(p.get('sort')==='title'?' selected':'')+'>Titel</option><option value="duration"'+(p.get('sort')==='duration'?' selected':'')+'>Laufzeit</option></select></label>'+
    '<label>Reihenfolge <select name="order"><option value="desc">Absteigend</option><option value="asc"'+(p.get('order')==='asc'?' selected':'')+'>Aufsteigend</option></select></label>'+
    input('limit','Maximale Ergebnisse','number')+'<button>Suchen</button></form>';
  const qs=new URLSearchParams(p);qs.delete('format');
  const result=items===null?'':'<h2>'+stats.returned+' von '+stats.totalMatched+' Treffern</h2><p><a href="/mrss?'+esc(qs.toString())+'">MRSS öffnen</a></p>'+
    items.map(x=>'<article><strong>'+esc(x.displayTitle)+'</strong><p>'+esc(x.provider)+' · '+esc(x.category||'')+' · '+esc(x.date||'')+'</p><p>'+esc(x.description.slice(0,250))+'</p>'+(x.link?'<a href="'+esc(x.link)+'">Quelle</a>':'')+'</article>').join('');
  return '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mediathek MRSS Suche</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem}form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}label{display:grid;gap:5px}input,select,button{padding:8px}article{border-bottom:1px solid #ccc;padding:1rem 0}</style><h1>Mediathek MRSS – Suche & Filter</h1><p>Filter gelten für aktuell gelieferte RSS-Einträge. Deutscher Ton wird nicht verifiziert.</p>'+form+result+'</html>';
}

const json=(value,status=200)=>Response.json(value,{status,headers:{'access-control-allow-origin':'*'}});
export default {async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,service:'mediathek-mrss',version:VERSION,providers:Object.keys(PROVIDERS).length,variantPolicy:'exclude',deduplication:'canonical-title-and-episode'});
  if(url.pathname==='/providers')return json(PROVIDERS);
  if(url.pathname==='/')return new Response(searchHtml(url.searchParams,null,null),{headers:{'content-type':'text/html; charset=utf-8'}});
  const isSearch=url.pathname==='/search';
  if(!isSearch&&url.pathname!=='/mrss'&&!url.pathname.startsWith('/mrss/'))return new Response('Use /, /search, /providers, /mrss or /mrss/{provider}',{status:404});
  const selected=url.pathname.startsWith('/mrss/')?[url.pathname.slice(6).toLowerCase()]:url.searchParams.get('providers')?.toLowerCase().split(',').map(x=>x.trim()).filter(Boolean)||Object.keys(PROVIDERS);
  if(!selected.length||selected.length>12||selected.some(n=>!Object.hasOwn(PROVIDERS,n)))return json({error:'Invalid provider',available:Object.keys(PROVIDERS)},400);
  const mode=url.searchParams.get('naming')||'emby';
  if(!['emby','original'].includes(mode))return json({error:'Invalid naming: use emby or original'},400);
  const rawLimit=url.searchParams.get('limit')||'250';
  if(!/^\d+$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>500)return json({error:'limit must be between 1 and 500'},400);
  const opts=filtersFrom(url.searchParams);
  if(opts.error)return json({error:opts.error},400);
  if(isSearch&&!['json','html'].includes(url.searchParams.get('format')||'json'))return json({error:'format must be json or html'},400);
  const datasets=await Promise.all(selected.map(async key=>{try {
    const feedUrl='https://mediathekviewweb.de/feed?query='+encodeURIComponent(PROVIDERS[key].query);
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
    let r;try {r=await fetch(feedUrl,{headers:{accept:'application/rss+xml, application/atom+xml, application/xml'},signal:controller.signal});}finally{clearTimeout(timeout);}
    if(!r.ok)throw new Error('upstream '+r.status);
    const xml=await r.text();if(!/<(?:rss|feed)\b/i.test(xml))throw new Error('not RSS or Atom');
    return {key,...parse(xml,PROVIDERS[key].label,mode),ok:true};
  }catch(e){return {key,items:[],ok:false,error:String(e.message||e)};}}));
  if(datasets.every(d=>!d.ok))return json({error:'All upstream RSS feeds failed',sources:datasets.map(({key,error})=>({key,error}))},502);
  const allItems=datasets.flatMap(d=>d.items);
  const merged=mergeItems(allItems);
  const matched=filterSort(merged.items,opts);
  const items=matched.slice(0,Number(rawLimit));
  const filteredVariants=datasets.reduce((total,d)=>total+(d.filteredVariants||0),0);
  const stats={totalMatched:matched.length,returned:items.length,filteredVariants,removedDuplicates:merged.duplicates,failedSources:datasets.filter(d=>!d.ok).map(d=>d.key)};
  if(isSearch){
    if(url.searchParams.get('format')==='html')return new Response(searchHtml(url.searchParams,items,stats),{headers:{'content-type':'text/html; charset=utf-8'}});
    return json({query:{providers:selected,...opts},...stats,items:items.map(searchItem)});
  }
  return new Response(xmlFeed(items,'Mediathek MRSS – '+selected.map(n=>PROVIDERS[n].label).join(', '),url.origin+url.pathname),{headers:{'content-type':'application/rss+xml; charset=utf-8','access-control-allow-origin':'*','cache-control':'public, max-age=300','x-feed-items':String(items.length),'x-total-matched':String(matched.length),'x-filtered-variants':String(filteredVariants),'x-removed-duplicates':String(merged.duplicates),'x-failed-sources':datasets.filter(d=>!d.ok).map(d=>d.key).join(',')}});
}};