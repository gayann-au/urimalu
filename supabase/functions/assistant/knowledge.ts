// Knowledge base: tier 2 of the assistant's three tiers.
//
//   1. App database  live listings and price history (listings.ts)
//   2. Knowledge base THIS FILE, facts about Urimalu that do not change often
//   3. Outside web    not built yet
//
// This is a hand edited file. The owner is expected to open it in an editor and
// change the wording, add sections, or correct a fact, without touching any
// other file. Keep it that way: plain data, no logic beyond the lookup below.
//
// WHY SECTIONS AND KEYWORDS, NOT ONE BIG BLOB:
// The whole file must never be sent to the model. Groq runs on a shared free
// tier quota, and pasting every fact into every prompt would burn it in a day.
// findSection picks the ONE section whose keywords the question hits hardest,
// and only that section's content goes into the prompt.
//
// RULES FOR EDITING:
//   - Keep every content string under 200 words. That cap is the token budget.
//   - Only write facts that are true of the live app. An invented fact here is
//     worse than a missing one, because the model will state it confidently.
//   - Do not contradict the BASE system prompt in prompts.ts. In particular:
//     the assistant replies in English only, prices are in Indian rupees, and
//     it never invents a price, a merchant name, or a number.
//   - Keywords are lowercase, letters and digits only. Phrases are fine
//     ("ready to sell"), punctuation is not. Matching is whole word.

export interface KnowledgeSection {
  // Short, lowercase, hyphenated. Worth logging so it is clear which section
  // answered a given question.
  id: string;
  // Lowercase match terms, including common alternate spellings and the
  // romanised Kannada the app already recognises.
  keywords: string[];
  // The answer text. Under 200 words.
  content: string;
}

export const KNOWLEDGE: KnowledgeSection[] = [
  {
    id: "what-is-urimalu",
    // No bare "urimalu". This section is index 0, so it wins every tie, and a
    // keyword that fires on any sentence naming the app would hijack questions
    // that belong further down the array.
    keywords: [
      "what is urimalu", "about urimalu", "urimalu free", "free",
      "free to use", "marketplace", "commission", "fee", "fees", "charge",
      "charges", "cost", "who runs urimalu", "why urimalu",
    ],
    content:
      "Urimalu is a crop price marketplace for farmers and merchants in Coorg, which is also called Kodagu, in Karnataka. Merchants post the prices they are paying for coffee, pepper, cardamom and arecanut. Farmers see those prices and call the merchant they choose.\n\n" +
      "Urimalu is only the place where the two sides meet. It does not buy or sell crops. It does not handle payments. It does not take a commission on any deal.\n\n" +
      "Urimalu is free to use.\n\n" +
      "A farmer can start the contact too. Posting a Ready to Sell notice tells every approved merchant who buys that crop that you have produce ready, and they can call you.\n\n" +
      "Urimalu is based in India and is meant for adults who farm or trade crops. You must be at least 18 years old to use it.\n\n" +
      "Farmers can send in ideas from inside the app, and the ones that get chosen are built.",
  },

  {
    id: "accounts-and-signup",
    keywords: [
      "sign up", "signup", "register", "registration", "new account",
      "create account", "create an account", "make a new account",
      "account details", "edit my account details",
      "login", "log in", "sign in", "password", "passwords",
      "forgot password", "forgot my password", "reset password",
      "google", "google sign in",
      "change my details", "edit my details", "change my phone number",
    ],
    content:
      "You sign up as either a Farmer or a Merchant. Pick the one that matches how you will use the app.\n\n" +
      "A farmer gives a name, email, phone number and password, and picks a district.\n\n" +
      "A merchant gives more: business name, owner name, town and district, years trading, type of business, the crops they trade, a WhatsApp number, and an optional short description of the business.\n\n" +
      "A password must be at least 6 characters. A phone number must be a 10 digit Indian mobile starting with 6, 7, 8 or 9.\n\n" +
      "You can also sign in with Google. If that Google account is new to Urimalu, you are asked whether you are a farmer or a merchant, then you fill in the same details.\n\n" +
      "If you forget your password, use Forgot password on the login screen and Urimalu emails you a reset link.\n\n" +
      "You can view and change most of your details on the My Account page.",
  },

  {
    id: "merchant-verification",
    keywords: [
      "verified", "verification", "verify", "approval", "approved", "approve",
      "account is approved", "account approved",
      "pending", "rejected", "rejection", "resubmit", "under review", "badge",
      "24 hours", "waiting", "not approved", "auto approve",
    ],
    content:
      "Every merchant is checked before their prices appear. A new merchant account starts as Pending.\n\n" +
      "If an admin has not reviewed the account within 24 hours, it is approved automatically. The Pending screen shows a countdown.\n\n" +
      "Being approved means a basic check was done. It is not a guarantee and it is not an endorsement of that merchant.\n\n" +
      "Once approved, the merchant adds their crops and prices, and those prices appear in the feed.\n\n" +
      "If an account is not approved, the reason is shown on screen. The merchant can fix the problems and resubmit for review.\n\n" +
      "A merchant who later changes their business name, business type or crops goes back for a quick review before those changes show on Urimalu. Their other details save right away.\n\n" +
      "Urimalu can remove or disable a merchant at any time.\n\n" +
      "Only approved merchants are shown to farmers, and only approved merchants can see Ready to Sell notices.",
  },

  {
    id: "prices-and-listings",
    keywords: [
      "price", "prices", "rate", "rates", "listing", "listings", "per kg", "kg",
      "bag", "quintal", "unit", "post a price", "post price", "add crop",
      "confirm", "confirmed", "updated", "stale", "outdated", "old price",
      "call for price", "price valid", "how long is the price valid",
      "valid till", "price history", "history", "compare",
      "feed", "search",
    ],
    content:
      "A merchant sets a price for each crop they are buying, and confirms those prices each day.\n\n" +
      "A price can be entered per kg, per 50kg bag, per 75kg bag, per 100kg bag, per quintal, or with a custom weight. When it is not per kg, the app also shows what that works out to per kg.\n\n" +
      "A merchant can choose Call for price instead of giving a number. Farmers then see Call for price and ring the merchant for the figure. A price can also carry a valid till date.\n\n" +
      "Every listing shows how fresh it is: just now, a number of hours ago, yesterday and not updated, or a number of days ago and outdated. A merchant who has not confirmed prices for 2 days gets a reminder.\n\n" +
      "Farmers can browse by merchant or by crop, search by merchant or town, and sort by price or by how recently a price was updated. You need to be logged in to see prices.\n\n" +
      "A merchant profile shows the last 7 days of price history.",
  },

  {
    id: "price-alerts",
    // The multi word phrases matter. A question like "set a price alert for
    // cardamom" hits "price" in prices-and-listings too, and that section is
    // earlier in the array, so it would win the tie. "price alert" gives this
    // section a second hit and breaks the tie on merit rather than on order.
    keywords: [
      "alert", "alerts", "price alert", "price alerts", "set an alert",
      "set alert", "notify", "notification", "notifications", "follow",
      "following", "unfollow", "watch", "price watch", "threshold", "limit",
      "crosses", "reminder", "push", "tell me when",
    ],
    content:
      "You can follow a crop and get an alert when its price changes.\n\n" +
      "There are two kinds. Any price change tells you whenever a merchant changes the price for that crop. The other kind only tells you when the price crosses a limit you set, in rupees per kg.\n\n" +
      "The alert names the crop, the new price per kg, and the merchant who posted it. If there was an earlier price, it shows that too.\n\n" +
      "Alerts appear on the Notifications page. If you allow notifications in your browser, they also arrive as push messages on your phone.\n\n" +
      "Merchants get alerts as well. A merchant is told when a farmer posts a Ready to Sell notice for a crop they buy, when a farmer opens their notice, and when their own account is approved or not approved.\n\n" +
      "To stop alerts for a crop, open that crop again and turn them off.",
  },

  {
    id: "ready-to-sell-leads",
    keywords: [
      "ready to sell", "seller lead", "seller leads", "lead", "leads",
      "i want to sell", "want to sell", "sell my crop", "selling",
      "produce ready", "post a notice",
    ],
    content:
      "A farmer who has produce ready can post a Ready to Sell notice from inside the app.\n\n" +
      "The notice carries your name, your phone number, and a short description of what you have. For example: 40kg Robusta Cherry ready, near Gonikoppal.\n\n" +
      "When you post it, every approved merchant who buys that crop is notified. They can then call you or message you on WhatsApp. This means a farmer can start the contact instead of waiting for a merchant to post first.\n\n" +
      "A farmer can have up to 5 active notices at a time. To post another after that, delete one of the existing ones.\n\n" +
      "Merchants see these notices on the Seller Leads tab of their dashboard, with the unread ones marked. Only approved merchants can see them.",
  },

  {
    id: "crops-and-names",
    keywords: [
      "crop", "crops", "coffee", "robusta", "arabica", "cherry", "parchment",
      "pepper", "black pepper", "karimenasu", "menasu", "kali mirch",
      "cardamom", "elaichi", "elakki", "arecanut", "areca", "adike", "adke",
      "supari", "betel nut", "light berries", "light berry", "grade",
      "crop name", "crop names", "rc", "rp", "ac", "ap", "bp1", "bp2",
    ],
    content:
      "Urimalu covers coffee, black pepper, cardamom and arecanut.\n\n" +
      "The crop names used in the app, with the Kannada spelling and the short code a merchant can type instead of the full name:\n" +
      "Robusta Cherry, ರೊಬಸ್ಟಾ ಚೆರಿ, rc\n" +
      "Robusta Cherry EP, ರೊಬಸ್ಟಾ ಚೆರಿ ಇಪಿ, rc\n" +
      "Robusta Parchment, ರೊಬಸ್ಟಾ ಪಾರ್ಚ್‌ಮೆಂಟ್, rp\n" +
      "Arabica Cherry, ಅರೇಬಿಕಾ ಚೆರಿ, ac\n" +
      "Arabica Cherry EP, ಅರೇಬಿಕಾ ಚೆರಿ ಇಪಿ, ac\n" +
      "Arabica Parchment, ಅರೇಬಿಕಾ ಪಾರ್ಚ್‌ಮೆಂಟ್, ap\n" +
      "Black Pepper Grade 1, ಕರಿಮೆಣಸು ಗ್ರೇಡ್ 1, bp1\n" +
      "Black Pepper Grade 2, ಕರಿಮೆಣಸು ಗ್ರೇಡ್ 2, bp2\n" +
      "Light Berries, ಲೈಟ್ ಬೆರಿ, lb\n" +
      "Cardamom, ಏಲಕ್ಕಿ, cd\n" +
      "Arecanut, ಅಡಿಕೆ, an\n\n" +
      "Pepper is also called karimenasu, menasu or kali mirch. Cardamom is also called elakki or elaichi. Arecanut is also called adike, adke, supari or betel nut.\n\n" +
      "A merchant can also type a crop name that is not on this list.",
  },

  {
    id: "places-and-markets",
    keywords: [
      "district", "districts", "town", "towns", "village", "place", "places",
      "area", "areas", "location", "market", "markets", "delivery point",
      "kodagu", "coorg", "chikmagalur", "chikkamagaluru", "chickmagalur",
      "hassan", "virajpet", "virajpete", "gonikoppal", "gonikoppa",
      "kushalnagar", "kushalnagara", "madikeri", "mercara", "somwarpet",
      "somvarpet", "ponnampet", "suntikoppa",
    ],
    content:
      "Urimalu is built for Coorg, which is also called Kodagu.\n\n" +
      "The districts you can pick are Kodagu, Chikmagalur, Hassan, and Other.\n\n" +
      "The towns used as delivery points are Virajpet, Gonikoppal, Kushalnagar, Madikeri, Somwarpet, Ponnampet and Suntikoppa.\n\n" +
      "Several of these places are spelled more than one way. Kodagu is also written Coorg. Chikmagalur is also written Chikkamagaluru or Chickmagalur. Virajpet is also written Virajpete. Gonikoppal is also written Gonikoppa. Kushalnagar is also written Kushalnagara. Madikeri is also called Mercara. Somwarpet is also written Somvarpet.\n\n" +
      "A price on Urimalu does not carry a place of its own. The place shown is where the merchant is. So asking for prices in a town or a district means prices from the merchants based there.\n\n" +
      "Every merchant shows their town and district on their profile and on their card in the feed.",
  },

  {
    id: "privacy-and-data",
    keywords: [
      "privacy", "private", "data", "my data", "delete my data",
      "where is my data", "personal", "information",
      "delete my account", "delete account", "deletion", "sell my data",
      "secure", "security", "visible", "public",
      "who can see", "who can see my", "hidden",
    ],
    content:
      "Urimalu collects only what it needs to run the service: your name, email and phone number when you make an account, and your password, which is stored scrambled so nobody at Urimalu can read it. Merchants also give their business details. Basic technical information such as your device or browser type is collected to keep the app working.\n\n" +
      "If you sign in with Google, Urimalu receives your name and email from Google. It never gets your Google password.\n\n" +
      "Approved merchants are public. Their business name, town, district, crops and contact details are shown to farmers, so only post details you are happy for other users to see. Farmer accounts are not shown publicly.\n\n" +
      "Urimalu does not sell your personal information. It is shared only with the companies that help run the app, such as the hosting and database provider and Google for sign in, or when the law requires it.\n\n" +
      "You can change most of your details on the My Account page, and you can ask for your account and personal information to be deleted.",
  },

  {
    id: "terms-and-liability",
    keywords: [
      "terms", "rules", "liability", "responsible", "responsibility", "dispute",
      "not paid", "has not paid", "did not pay", "did not pay me",
      "cheated", "cheated me", "cheating", "cheating me",
      "scam", "complaint", "banned",
      "suspended", "close my account", "law", "legal", "court", "fake",
      "guarantee",
    ],
    content:
      "Any deal is strictly between the farmer and the merchant. Urimalu is not part of the deal. It is not responsible for the price, the quality, the payment, the delivery, or how the deal turns out. Check the details and agree everything directly with the other person.\n\n" +
      "Use Urimalu honestly. Do not post false or fake prices. Do not pretend to be someone else or use a fake business. Do not use the app for anything illegal, and do not harass other users. Do not try to break, copy or scrape the app, or collect other users data.\n\n" +
      "Keep your password safe, do not share your account, and keep your details accurate. You are responsible for what happens under your account.\n\n" +
      "Urimalu can suspend or close an account that breaks these rules or puts other users at risk. You can also ask for your account to be closed at any time.\n\n" +
      "Indian law applies, including the Information Technology Act 2000. Disputes go to the courts of India.",
  },

  {
    id: "language-and-app-basics",
    keywords: [
      "language", "languages", "kannada", "english", "translate", "translation",
      "change language", "in kannada", "phone screen", "mobile", "rupees",
      "currency",
    ],
    content:
      "Urimalu is bilingual. The default language is Kannada, and there is a toggle to switch to English.\n\n" +
      "Crop names show their Kannada spelling when the app is in Kannada, but the English spelling is what gets saved, so price alerts keep matching on one spelling.\n\n" +
      "The app is built for a phone screen.\n\n" +
      "This assistant replies in English only for now, even if you write in Kannada or another language. The rest of the app stays bilingual.\n\n" +
      "This assistant can help with crop prices, market listings, general farming and market guidance, and how Urimalu works. It will not answer questions outside that.\n\n" +
      "All prices in the app are in Indian rupees.",
  },

  {
    id: "contact-and-support",
    keywords: [
      "contact", "contact us", "support", "email", "who do i email",
      "your email", "feedback", "feature request",
      "suggestion", "suggest", "idea", "report", "report a merchant",
      "review", "reviews", "rating", "ratings", "stars",
    ],
    content:
      "For questions about your account, your privacy, or the terms, email noreply.rentritz@gmail.com.\n\n" +
      "You can send a feature request from inside the app. Pick a category, which is Pricing, Crops, Notifications, App Experience or Other, then give a short title and a description of at least 20 characters. You can see your past requests and where each one stands: New, Under review, Planned, Rejected or Done.\n\n" +
      "If a merchant is behaving badly, you can report them from their profile. You have to be logged in to do that. Urimalu reviews reports and can disable a merchant.\n\n" +
      "Farmers can leave a review on a merchant profile, with a star rating and an optional comment. The rating and the reviews show on that merchant's profile.",
  },
];

// Normalise a message for whole word matching. Lowercase, every run of
// non-alphanumeric characters becomes a single space, and the result is padded
// with a space at each end so a keyword check is a plain includes. Same
// approach as catalog.ts, so a short keyword like "rc" or "ap" can only match a
// standalone word and never letters buried inside a longer one.
function normalise(message: string): string {
  return " " + message.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() + " ";
}

// Pick the single best matching section for a question, or null when nothing
// matches. Best means the most keyword hits. On a tie the earlier section in
// KNOWLEDGE wins, so the order of the array is the tie breaker and broad
// sections are placed above narrow ones.
//
// There is deliberately no default section. A question this file cannot answer
// must fall through to the caller, not be answered out of the wrong section.
export function findSection(message: string): KnowledgeSection | null {
  const hay = normalise(message);
  if (hay.trim() === "") return null;

  let best: KnowledgeSection | null = null;
  let bestHits = 0;

  for (const section of KNOWLEDGE) {
    let hits = 0;
    for (const keyword of section.keywords) {
      if (hay.includes(" " + keyword + " ")) hits++;
    }
    // Strictly greater, so the first section to reach a given score keeps it.
    if (hits > bestHits) {
      best = section;
      bestHits = hits;
    }
  }

  return bestHits > 0 ? best : null;
}
