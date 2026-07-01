import LegalPage, { H2, P, UL } from "./LegalPage";

// Plain language terms of service for Urimalu. The goal is for an average person
// to understand the deal: we connect farmers and merchants, but the actual trade
// is between them, not us.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="20 June 2026">
      <P>
        Welcome to Urimalu. Urimalu is a small marketplace based in India, that
        helps farmers and merchants see real daily crop prices and contact each
        other. By using Urimalu you agree to these terms. If you
        do not agree, please do not use the app.
      </P>

      <H2>What Urimalu does</H2>
      <P>
        Urimalu lets merchants post their daily crop prices and lets farmers view
        those prices and reach out to merchants directly. We are only the place
        where you meet. We do not buy or sell crops, we do not handle payments,
        and we do not take a commission on any deal.
      </P>

      <H2>Your account</H2>
      <UL>
        <li>Give us accurate information and keep it up to date.</li>
        <li>Keep your password safe and do not share your account with others.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>You must be at least 18 years old to use Urimalu.</li>
      </UL>

      <H2>Merchant verification</H2>
      <P>
        Merchants are reviewed before they can post prices. We may approve or
        reject a merchant, and we may remove a merchant later if needed. Being
        approved means we did a basic check. It is not a guarantee or an
        endorsement of that merchant.
      </P>

      <H2>Fair use</H2>
      <P>Please use Urimalu honestly. Do not:</P>
      <UL>
        <li>Post false, misleading, or fake prices.</li>
        <li>Pretend to be someone else or use a fake business.</li>
        <li>Use the app for anything illegal, or harass other users.</li>
        <li>Try to break, copy, or scrape the app, or collect other users data.</li>
      </UL>

      <H2>What you post</H2>
      <P>
        You keep ownership of the details and content you add. By posting them,
        you give us permission to show them in the app so the service can work.
        You are responsible for making sure what you post is true and that you are
        allowed to share it.
      </P>

      <H2>Deals are between you</H2>
      <P>
        Any deal, agreement, or payment is strictly between the farmer and the
        merchant. Urimalu is not part of the deal. Please check details and agree
        terms directly with the other person. We are not responsible for the
        price, quality, payment, delivery, or outcome of any deal made through the
        app.
      </P>

      <H2>Availability</H2>
      <P>
        We provide Urimalu as it is. The app may sometimes be slow, unavailable,
        or change as we improve it, and we may add or remove features. We do our
        best to keep it running but cannot promise it will always be available.
      </P>

      <H2>Our responsibility</H2>
      <P>
        To the extent allowed by law, Urimalu is not responsible for any loss or
        damage that comes from using the app or from deals made between users. You
        use the app and deal with other users at your own risk.
      </P>

      <H2>Closing accounts</H2>
      <P>
        We may suspend or close an account that breaks these terms or that puts
        other users at risk. You can also stop using Urimalu and ask us to close
        your account at any time.
      </P>

      <H2>Changes to these terms</H2>
      <P>
        We may update these terms from time to time. When we do, we will change
        the date at the top of this page. If you keep using Urimalu after a
        change, that means you accept the new terms.
      </P>

      <H2>Which laws apply</H2>
      <P>
        These terms are governed by the laws of India, including the Information
        Technology Act 2000 and the Information Technology Rules made under it.
        Any disputes will be handled by the courts of India.
      </P>

      <H2>Contact us</H2>
      <P>
        If you have any questions about these terms, email us at{" "}
        <a className="font-semibold text-coorg-700 hover:text-coorg-800" href="mailto:noreply.rentritz@gmail.com">
          noreply.rentritz@gmail.com
        </a>
        .
      </P>
    </LegalPage>
  );
}
