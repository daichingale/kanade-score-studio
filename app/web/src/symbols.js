/* Presets for note marks and directions. Bravura glyphs follow SMuFL. */
(function(root,factory){
 const catalog=factory();
 if(typeof module==='object'&&module.exports)module.exports=catalog;
 root.KanadeSymbols=catalog;
})(globalThis,function(){
 'use strict';
 const noteGroups=[
  ['アーティキュレーション',[
   ['accent','アクセント',0xe4a0,'articulations','accent'],['staccato','スタッカート',0xe4a2,'articulations','staccato'],
   ['tenuto','テヌート',0xe4a4,'articulations','tenuto'],['marcato','マルカート',0xe4ac,'articulations','strong-accent'],
   ['staccatissimo','スタッカティッシモ',0xe4a6,'articulations','staccatissimo'],['detached-legato','ポルタート',0xe4b2,'articulations','detached-legato'],
   ['spiccato','スピッカート',0xe4a8,'articulations','spiccato'],['breath-mark','ブレス',0xe4ce,'articulations','breath-mark'],
   ['caesura','カエスーラ',0xe4d1,'articulations','caesura'],['fermata','フェルマータ',0xe4c0,'fermata','normal'],
   ['short-fermata','短いフェルマータ',0xe4c4,'fermata','angled'],['long-fermata','長いフェルマータ',0xe4c6,'fermata','square'],
  ]],
  ['装飾音・トレモロ',[
   ['trill','トリル',0xe566,'ornaments','trill-mark'],['turn','ターン',0xe567,'ornaments','turn'],
   ['inverted-turn','逆ターン',0xe568,'ornaments','inverted-turn'],['vertical-turn','縦ターン',0xe56a,'ornaments','vertical-turn'],
   ['mordent','モルデント',0xe56d,'ornaments','mordent'],['inverted-mordent','逆モルデント',0xe56c,'ornaments','inverted-mordent'],
   ['tremolo-1','トレモロ 1本',0xe220,'ornaments','tremolo:1'],['tremolo-2','トレモロ 2本',0xe221,'ornaments','tremolo:2'],['tremolo-3','トレモロ 3本',0xe222,'ornaments','tremolo:3'],
  ]],
  ['弦・管・打楽器',[
   ['up-bow','上げ弓',0xe612,'technical','up-bow'],['down-bow','下げ弓',0xe610,'technical','down-bow'],
   ['harmonic','ハーモニクス',0xe614,'technical','harmonic'],['snap-pizzicato','バルトーク・ピッツィカート',0xe631,'technical','snap-pizzicato'],
   ['left-hand-pizzicato','左手ピッツィカート','＋','technical','other-technical'],
   ['stopped','ストップ奏法','＋','technical','stopped'],['open-string','開放弦','○','technical','open-string'],
   ['heel','かかと','⌣','technical','heel'],['toe','つま先','∧','technical','toe'],
   ['fingering-0','指番号 0','0','technical','fingering'],['fingering-1','指番号 1','1','technical','fingering'],
   ['fingering-2','指番号 2','2','technical','fingering'],['fingering-3','指番号 3','3','technical','fingering'],
   ['fingering-4','指番号 4','4','technical','fingering'],['fingering-5','指番号 5','5','technical','fingering'],
  ]],
 ];
 const notes=Object.fromEntries(noteGroups.flatMap(([,group])=>group.map(([key,label,glyph,kind,xml])=>[key,{label,glyph,kind,xml}])));
 const words=(group,placement,style,items)=>items.split('|').map(label=>({key:group+':'+label,label,group,placement,style}));
 const directions=[
  ...'pppppp ppppp pppp ppp pp p mp mf f ff fff ffff fffff ffffff fp pf sf sfp sfpp sfz sfzp sffz fz rf rfz'.split(' ').map(label=>({key:label,label,group:'強弱',placement:'below',style:'dynamic'})),
  {key:'crescendo',label:'クレッシェンド（松葉）',group:'強弱',placement:'below',style:'wedge'},
  {key:'diminuendo',label:'デクレッシェンド（松葉）',group:'強弱',placement:'below',style:'wedge'},
  {key:'slur',label:'スラー',group:'奏法',placement:'above',style:'slur'},
  ...words('強弱','below','italic','cresc.|decresc.|dim.|morendo|smorzando|calando|perdendosi|sotto voce|sempre p|sempre f|poco a poco cresc.|subito p|subito f|più f|meno f|渐强|渐弱|次第に強く|次第に弱く'),
  ...words('速度','above','tempo','Larghissimo|Grave|Largo|Lento|Adagio|Adagietto|Larghetto|Andante|Andantino|Moderato|Allegretto|Allegro moderato|Allegro|Vivace|Vivo|Vivacissimo|Presto|Prestissimo|Tempo di marcia|Tempo di valse|Alla breve|Tempo comodo|Tempo giusto|Tempo primo|Tempo II|a tempo|rubato|rit.|ritardando|rall.|rallentando|ritenuto|riten.|allargando|accel.|accelerando|stringendo|stretto|affrettando|più mosso|meno mosso|poco mosso|non troppo|senza tempo|Très lent|Lent|Modéré|Vif|Très vif|Langsam|Mäßig|Schnell|Lebhaft|Ruhig|缓慢|中速|快速|ゆっくり|速く'),
  ...words('発想','above','italic','cantabile|dolce|espressivo|con espressione|legato|sempre legato|non legato|sostenuto|tenuto|marcato|leggiero|leggerissimo|grazioso|giocoso|scherzando|animato|agitato|appassionato|con brio|con fuoco|con moto|con spirito|energico|eroico|maestoso|grandioso|solenne|religioso|misterioso|tranquillo|sereno|delicato|tenderly|mesto|doloroso|lamentoso|furioso|feroce|brillante|festivo|trionfale|semplice|scherzoso|sonoro|secco|tutti|solo|simile|sempre|subito|poco a poco|molto|assai|quasi|ad libitum|expressif|doux|léger|avec élan|très calme|mit Ausdruck|zart|feierlich|lebhaft|柔和地|有表情地|歌うように|力強く'),
  ...words('奏法','above','italic','arco|pizz.|pizzicato|col legno|col legno battuto|col legno tratto|sul ponticello|sul tasto|flautando|ordinario|non vibrato|molto vibrato|con sord.|senza sord.|mute|open|stopped|cuivré|flutter-tongue|frullato|bisbigliando|gliss.|portamento|trem.|harmonics|let ring|damp|Ped.|una corda|tre corde|sostenuto pedal|mallets|sticks|brushes|rim shot|cross stick|roll|choke|swing|straight|freely|a2|divisi|unis.'),
  ...words('進行・リハーサル','above','tempo','D.C.|D.C. al Fine|D.C. al Coda|D.S.|D.S. al Fine|D.S. al Coda|To Coda|Fine|Segue|Attacca|Repeat ad lib.|1st time only|2nd time only|A|B|C|D|E|F|G|H|I|J'),
  {key:'segno',label:'セーニョ',group:'進行・リハーサル',placement:'above',style:'glyph',glyph:0xe047,xml:'segno'},
  {key:'coda',label:'コーダ',group:'進行・リハーサル',placement:'above',style:'glyph',glyph:0xe048,xml:'coda'},
  {key:'chordSymbol',label:'コード名',group:'その他',placement:'above',style:'chord'},
  {key:'custom',label:'任意の指示',group:'その他',placement:'above',style:'italic'},
 ];
 return {noteGroups,notes,directions,byKey:Object.fromEntries(directions.map(mark=>[mark.key,mark]))};
});
