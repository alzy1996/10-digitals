/**
 * Arabic is a first-class mode, not a translation layer (PRD 2.3, locked).
 *
 * Typed as Strings, so leaving anything out fails the build rather than
 * shipping an English word into an Arabic shift.
 */

import type { Strings } from "./strings.en";

export const ar: Strings = {
  app: {
    title: "أكاديمية الخدمات اللوجستية",
    subtitle: "الطاحونة",
    tagline: "كل وظيفة في هذه الشركة هي عمل لوجستي. تعلّم السلسلة كاملة.",
    org: "مطاحن الدقيق العمانية — مصانع الأعلاف",
  },

  nav: {
    chapters: "الفصول",
    back: "رجوع",
    replay: "إعادة",
    retry: "أعد المحاولة",
    next: "التالي",
    finish: "إنهاء",
    close: "إغلاق",
    language: "English",
  },

  hud: {
    ledger: "الحساب",
    omr: "ر.ع",
    time: "الوقت",
    omanTime: "توقيت عُمان",
    millDay: "يوم المصنع",
    ghostHour: "الساعة الشبح — سيُقيَّد هذا في يوم الإنتاج السابق",
    progress: "التقدّم",
  },

  chapter: {
    ch0: "أهلاً بالطاحونة",
    ch1: "الطلب",
    ch2: "أرضية المصنع",
    ch3: "الكيس",
    ch4: "المخزن",
    ch5: "الساحة",
    ch6: "الطريق",
    ch7: "الاستلام",
    ch8: "الوردية",
    ch9: "الوردية الكاملة",
    locked: "أكمل الفصل السابق لفتح هذا الفصل",
    comingSoon: "لم يُبنَ بعد",
  },

  level: {
    start: "ابدأ",
    objective: "الهدف",
    timeLeft: "الوقت المتبقي",
    score: "النتيجة",
    stars: "النجوم",
    accuracy: "الدقة",
    speed: "السرعة",
    cost: "التكلفة",
    safety: "السلامة",
    passed: "ناجح",
    failed: "لم تنجح",
    consequence: "ما كلّفه هذا",
    whatHappened: "ماذا حدث",
    tryAgain: "أعد التشغيل",
  },

  l0_2: {
    title: "لغة الطاحونة",
    objective: "طابق كل مصطلح باسمه العربي. ثلاثون كلمة تستخدمها السلسلة كلها.",
    prompt: "اختر المصطلح المطابق",
    correct: "مطابق",
    wrong: "ليس هذا",
    remaining: "المتبقي",
  },

  l1_1: {
    title: "اقرأ أمر البيع",
    objective: "استخرج الحقول الخمسة من أمر البيع: العميل، رمز المنتج، الأطنان، الأكياس، الموعد النهائي.",
    fieldCustomer: "العميل",
    fieldProduct: "رمز المنتج",
    fieldMt: "الكمية (طن)",
    fieldBags: "الأكياس",
    fieldDeadline: "الموعد النهائي",
    tapToFill: "اختر قيمة بالأسفل ثم الخانة التي تنتمي إليها",
    slotEmpty: "فارغ",
    docTitle: "أمر بيع",
    docNote: "التصميم مؤقت حتى تتوفر نسخة PDF مجهّلة من أمر بيع حقيقي.",
  },

  l1_2: {
    title: "فكّ الرمز",
    objective: "طابق رمز بوهلر بالمنتج. هذه الرموز الستة عشر هي التي يعمل بها القسم يومياً.",
    prompt: "أي رمز طلبه أمر البيع؟",
    hint: "٧١٦ ليس ٧١٥. اقرأ الأرقام لا الشكل.",
  },

  l1_3: {
    title: "من الطن إلى الكيس",
    objective: "الطن الواحد أربعون كيساً من ٢٥ كجم. حوّل حتى يصبح ذلك تلقائياً.",
    promptToBags: "كم كيساً في {mt} طن؟",
    promptToMt: "كم طناً في {bags} كيس؟",
    unitBags: "كيس",
    unitMt: "طن",
    streak: "المتتالية",
  },

  l1_4: {
    title: "الموعد النهائي",
    objective: "رتّب هذه الأربعة حسب الإلحاح الحقيقي، لا حسب ترتيب وصولها.",
    prompt: "اسحب لإعادة الترتيب ثم أكّد",
    commit: "أكّد الطابور",
    ferryNote: "مرحلة العبّارة",
    transitNote: "زمن النقل",
  },

  l1_5: {
    title: "أمر البيع المفقود",
    objective: "صندوق التوصيل يشير إلى ثمانية أوامر. القائمة تعرض سبعة. اعثر على المفقود وبلّغ عنه.",
    prompt: "أي أمر بيع مفقود من القائمة؟",
    report: "بلّغ عن خلل النظام",
    reported: "تم التبليغ — وهذا هو الجواب الصحيح المحتسب، وليس إضافة",
    inbox: "صندوق التوصيل",
    list: "قائمة أوامر البيع",
  },

  result: {
    title: "تقرير الوردية",
    omrNet: "الصافي بالريال",
    omrLost: "الخسارة",
    omrEarned: "المكسب",
    breakdown: "أين ذهب المال",
    noCost: "لا خسائر — تشغيل نظيف",
    replaySaved: "حُفظت الإعادة",
    replaySize: "{bytes} بايت",
  },

  reason: {
    wrong_product: "تحميل منتج خاطئ",
    wrong_truck_type: "حجز نوع شاحنة خاطئ",
    out_of_scope_route: "مسار خارج نطاقك",
    no_contract_escalated: "تصعيد صحيح",
    fifo_breach: "مخالفة الأقدم أولاً",
    stock_written_off: "مخزون مشطوب",
    overfill: "زيادة التعبئة",
    idle_labour: "عمالة متوقفة",
    truck_waiting: "شاحنة منتظرة",
    missing_document: "مستند ناقص",
    deadline_missed: "تفويت الموعد النهائي",
    ferry_missed: "تفويت العبّارة",
    day_boundary_misposted: "قُيّد في يوم إنتاج خاطئ",
    unsafe_act: "تصرّف غير آمن",
    correct_call: "قرار صحيح",
    on_time_delivery: "تسليم في الموعد",
    under_budget: "ضمن الميزانية",
  },

  confirm: {
    badge: "بانتظار التأكيد",
    title: "قيمة غير مؤكدة",
    body: "هذه القيمة مؤقتة. تُعرض حتى لا يظنها أحد حقيقة من حقائق الشركة، وتتغيّر من مكان واحد بمجرد تأكيدها.",
    productNames: "أسماء المنتجات ورموز نظام ERP بانتظار التصدير من Smart Fleet v5.1. الرموز المعروضة هي رموز بوهلر المؤكدة.",
    millTz: "فرق توقيت بوهلر مُنمذَج كفارق ثابت بتوقيت وسط أوروبا. أما تغيّره مع التوقيت الصيفي الأوروبي فغير مؤكد.",
  },
};
