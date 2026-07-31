/**
 * Every English string in the product. Zero hardcoded text in components -
 * standing architectural law (PRD 5.11, 12).
 *
 * strings.ar.ts is typed against this object, so a missing Arabic translation
 * is a compile error rather than an English word leaking into an Arabic shift.
 */

export const en = {
  app: {
    title: "OFM Logistics Academy",
    subtitle: "The Mill",
    tagline: "Every job in this company is logistics. Learn the whole chain.",
    org: "Oman Flour Mills — Feed Mills",
  },

  nav: {
    chapters: "Chapters",
    back: "Back",
    replay: "Replay",
    retry: "Retry",
    next: "Next",
    finish: "Finish",
    close: "Close",
    language: "العربية",
  },

  hud: {
    ledger: "Ledger",
    omr: "OMR",
    time: "Time",
    omanTime: "Oman",
    millDay: "Mill day",
    ghostHour: "Ghost hour — this posts to the previous production day",
    progress: "Progress",
  },

  chapter: {
    ch0: "Welcome to the Mill",
    ch1: "The Order",
    ch2: "The Mill Floor",
    ch3: "The Bag",
    ch4: "The Warehouse",
    ch5: "The Yard",
    ch6: "The Road",
    ch7: "Receiving",
    ch8: "The Shift",
    ch9: "The Full Shift",
    locked: "Finish the chapter before this one to unlock",
    comingSoon: "Not built yet",
  },

  level: {
    start: "Start",
    objective: "Objective",
    timeLeft: "Time left",
    score: "Score",
    stars: "Stars",
    accuracy: "Accuracy",
    speed: "Speed",
    cost: "Cost",
    safety: "Safety",
    passed: "Passed",
    failed: "Not passed",
    consequence: "What this costs",
    whatHappened: "What happened",
    tryAgain: "Run it again",
  },

  l0_2: {
    title: "The Language of the Mill",
    objective: "Match each term to its Arabic name. Thirty words the whole chain uses.",
    prompt: "Tap the matching term",
    correct: "Matched",
    wrong: "Not that one",
    remaining: "Remaining",
  },

  l1_1: {
    title: "Read the SO",
    objective: "Pull the five fields off the Sales Order: customer, product code, tonnes, bags, deadline.",
    fieldCustomer: "Customer",
    fieldProduct: "Product code",
    fieldMt: "Quantity (MT)",
    fieldBags: "Bags",
    fieldDeadline: "Deadline",
    tapToFill: "Tap a value below, then the slot it belongs in",
    slotEmpty: "empty",
    docTitle: "SALES ORDER",
    docNote: "Layout is a placeholder until an anonymised SO PDF is supplied.",
  },

  l1_2: {
    title: "Code Breaker",
    objective: "Match the Bühler code to the product. These sixteen are the codes the department works with daily.",
    prompt: "Which code did the order ask for?",
    hint: "716 is not 715. Read the digits, not the shape.",
  },

  l1_3: {
    title: "MT to Bags",
    objective: "One tonne is forty bags of 25 kg. Convert until it is reflex.",
    promptToBags: "How many bags in {mt} MT?",
    promptToMt: "How many MT in {bags} bags?",
    unitBags: "bags",
    unitMt: "MT",
    streak: "Streak",
  },

  l1_4: {
    title: "The Deadline",
    objective: "Order these four by real urgency, not by the order they arrived.",
    prompt: "Drag to reorder, then commit",
    commit: "Commit the queue",
    ferryNote: "Ferry leg",
    transitNote: "Transit",
  },

  l1_5: {
    title: "The Ghost SO",
    objective: "The dispatch inbox references eight orders. The list shows seven. Find the missing one and report it.",
    prompt: "Which order is missing from the list?",
    report: "Report the system bug",
    reported: "Reported — this is the scored correct answer, not an extra",
    inbox: "Dispatch inbox",
    list: "SO list",
  },

  l3_2: {
    title: "The Scale",
    objective: "Hold every bag at 25.0 kg. The needle drifts; stop it on the mark.",
    prompt: "Tap STOP at 25.0 kg",
    stop: "STOP",
    bag: "Bag",
    deviation: "Average deviation",
    thisBag: "This bag",
    grams: "g",
  },

  l3_3: {
    title: "400 Free Kilos",
    objective: "Pick the line setting for this run. Faster is not cheaper.",
    prompt: "Set the target bag weight",
    throughput: "Throughput",
    giveaway: "Given away",
    perTruck: "This truck",
    perYear: "At this rate, per year",
    run: "Run the truck",
    reveal: "Everything looked fine. Here is what left the site free.",
    bagsFilled: "Bags filled",
  },

  l6_1: {
    title: "Bagged or Bulk?",
    objective: "Cargo form decides the truck. Not the customer, not the price.",
    prompt: "This load is",
    pickTruck: "Which truck do you book?",
    flatbed: "Flat Bed 40 ft",
    tipper: "Tipper",
    bagged: "Bagged, 25 kg",
    bulk: "Bulk",
  },

  l6_3: {
    title: "The Contract Board",
    objective: "Send each order to a transporter that actually holds the contract.",
    prompt: "Who carries this one?",
    rate: "Rate",
    noRate: "per MT",
    escalate: "NO CONTRACT — escalate",
  },

  l6_4: {
    title: "Sohar Poultry",
    objective: "Two carriers serve Sohar Poultry. Only one can carry this load.",
    cargo: "Cargo",
    premixBags: "Premix, 25 kg bags",
    trap: "One is cheaper on paper. Read the cargo form before the rate.",
  },

  l6_6: {
    title: "No Contract",
    objective: "An unlisted route lands in your inbox. Decide what to do with it.",
    prompt: "This route is not on the contract board",
    improvise: "Book it anyway at a guessed rate",
    escalateNow: "Flag NO CONTRACT — handle manually",
  },

  l6_7: {
    title: "The Ferry",
    objective: "Masirah is reached via the Shannah ferry. Transit is not distance.",
    prompt: "Which departure gets the load there in time?",
    ferryAt: "Ferry departs",
    arriveBy: "Customer needs it by",
    driveTime: "Drive to Shannah",
    missed: "Missed the ferry",
  },

  l8_2: {
    title: "Labour Forecast",
    objective: "Today's real orders, not an average. Open the right number of belts and set the crew.",
    belts: "Belts open",
    bays: "Bays open",
    crew: "Crew",
    ordersToday: "Confirmed orders today",
    day: "Day",
    night: "Night",
    forecast: "Forecast",
    commit: "Commit the plan",
    idle: "Idle labour",
    waiting: "Trucks waiting",
    target: "The SLS output format",
  },

  l8_5: {
    title: "The Leave Chain",
    objective: "Someone is on leave. Cover the exact shift, from the opposite team only.",
    onLeave: "On leave",
    pickCover: "Pick the replacement",
    teamA: "Team A",
    teamB: "Team B",
    chainPreview: "Chain preview",
    coverage: "Coverage",
    gap: "Gap",
    confirm: "Confirm the chain",
    sameTeam: "Same-team cover is not allowed",
  },

  l8_6: {
    title: "The Ghost Hour",
    objective: "Post this load so it lands on the right production day.",
    postAt: "Post the load at",
    omanClock: "Oman",
    millClock: "Mill production day",
    willFileOn: "This will file on production day",
    today: "today",
    yesterday: "yesterday",
    post: "Post the load",
    waitUntil: "Wait until after the rollover",
    rollover: "Production day rolls over at",
  },

  l2_1: {
    title: "Raw Material Check",
    objective: "Before you promise a date, check the materials are actually there.",
    prompt: "Can this batch run today?",
    stock: "Stock board",
    required: "Required",
    available: "Available",
    short: "Short",
    canRun: "Materials are ready",
    cannotRun: "Not ready — push the date",
    rmNote: "The full raw-material master is not yet exported; this board uses the categories confirmed in the production check.",
  },

  l2_5: {
    title: "The Dispatch Handshake",
    objective: "Send the message that starts the delivery loop. Vague costs a truck.",
    trigger: "@Delivery AFM — Please dispatch",
    prompt: "Attach the fields the clerk needs",
    include: "Include",
    omit: "Leave out",
    send: "Send the message",
    missing: "Missing fields",
  },

  l4_2: {
    title: "FIFO",
    objective: "Oldest batch first. The newest pallet is always the closest one.",
    prompt: "Which batch do you pick?",
    produced: "Produced",
    daysOld: "days old",
    nearest: "Nearest the aisle",
  },

  l5_5: {
    title: "Gross and Net",
    objective: "Net is gross minus tare. Out of tolerance, the truck does not leave.",
    tare: "Tare",
    gross: "Gross",
    net: "Net",
    soQty: "SO quantity",
    computeNet: "Enter the net weight",
    dispatch: "Dispatch",
    stop: "STOP — do not dispatch",
    tolerance: "Tolerance",
    toleranceNote: "The real accepted variance is not yet confirmed; this level uses ±2%.",
  },

  l5_6: {
    title: "The Paper Chain",
    objective: "Delivery signs, then Packing, then Production. The order cannot be skipped.",
    delivery: "Delivery",
    packing: "Packing",
    production: "Production",
    sign: "Sign",
    signed: "Signed",
    remark: "Production remark",
    outOfOrder: "That signature cannot come yet",
    complete: "Chain complete",
  },

  l6_5: {
    title: "Not My Lane",
    objective: "A tipper route lands in your inbox. Your scope is bags and flat bed.",
    prompt: "What do you do with it?",
    book: "Book the tipper",
    refuse: "Out of scope — pass it on",
  },

  l7_2: {
    title: "Inbound Weighbridge",
    objective: "Receiving reverses the arithmetic: the truck arrives full and leaves empty.",
    firstWeigh: "First weigh (loaded)",
    secondWeigh: "Second weigh (empty)",
    received: "Quantity received",
    enterReceived: "Enter the quantity received",
    item: "Bran Barley",
  },

  l9_1: {
    title: "The Full Shift",
    objective: "No hints, no pause. Everything you have learned, in one run.",
    incoming: "Incoming",
    decide: "Decide",
    remaining: "Remaining",
  },

  result: {
    title: "Shift report",
    omrNet: "Net OMR",
    omrLost: "Lost",
    omrEarned: "Earned",
    breakdown: "Where the money went",
    noCost: "Nothing lost — clean run",
    replaySaved: "Replay saved",
    replaySize: "{bytes} bytes",
  },

  progress: {
    rank: "Rank",
    badges: "Badges",
    certificate: "Certificate",
    print: "Print / Save as PDF",
    learnerName: "Learner name",
    issued: "Issued",
    verify: "Verification code",
    notYet: "Pass a chapter to earn a certificate",
    reset: "Reset progress",
  },

  rank: {
    trainee: "Trainee",
    clerk: "Clerk",
    operator: "Operator",
    dispatcher: "Dispatcher",
    supervisor: "Supervisor",
    millMaster: "Mill Master",
  },

  badge: {
    zeroOverfill: "Zero-Overfill Shift",
    fifoPerfect: "FIFO Perfect",
    escalatedCorrectly: "Escalated Correctly",
    ghostSoHunter: "Ghost SO Hunter",
    ferryCaught: "Ferry Caught",
    underBudget: "Under Budget",
  },

  reason: {
    wrong_product: "Wrong product loaded",
    wrong_truck_type: "Wrong truck type booked",
    out_of_scope_route: "Route outside your scope",
    no_contract_escalated: "Escalated correctly",
    fifo_breach: "FIFO breach",
    stock_written_off: "Stock written off",
    overfill: "Overfill",
    idle_labour: "Idle labour",
    truck_waiting: "Truck waiting",
    missing_document: "Missing document",
    deadline_missed: "Deadline missed",
    ferry_missed: "Ferry missed",
    day_boundary_misposted: "Posted to the wrong production day",
    unsafe_act: "Unsafe act",
    correct_call: "Correct call",
    on_time_delivery: "Delivered on time",
    under_budget: "Under budget",
  },

  confirm: {
    badge: "TODO_CONFIRM",
    title: "Unconfirmed value",
    body: "This value is a placeholder. It is shown so nobody mistakes it for OFM fact, and it changes in one place once confirmed.",
    productNames: "Product names and ERP codes await the Smart Fleet v5.1 export. Codes shown are the confirmed Bühler codes.",
    millTz: "The Bühler timezone offset is modelled as a fixed CET offset. Whether it shifts with European DST is unconfirmed.",
  },
};

/**
 * The shape of the copy, with values widened to string. Without this the
 * `en` literals would become the required type and every Arabic translation
 * would fail to assign.
 */
export type Strings = typeof en;
