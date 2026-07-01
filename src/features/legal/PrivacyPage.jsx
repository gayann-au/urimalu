import LegalPage, { H2, P, UL } from "./LegalPage";

// Plain language privacy policy for Urimalu, an India based marketplace that
// connects farmers and merchants. Written to be easy to read, not legalese.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="20 June 2026">
      <P>
        Urimalu is a small marketplace based in India. It
        connects farmers and merchants so they can see real daily crop prices and
        deal with each other directly. This page explains, in plain words, what
        information we collect, why we collect it, and what you can do about it.
      </P>

      <H2>What we collect</H2>
      <P>We only collect what we need to run the service:</P>
      <UL>
        <li>Your name, email address, and phone number when you create an account.</li>
        <li>Your password, which is stored in a scrambled form that we cannot read.</li>
        <li>
          If you are a merchant: your business details, such as business name,
          owner name, town and district, years trading, business type, the crops
          you trade, your WhatsApp number, and an optional short description.
        </li>
        <li>
          If you sign in with Google: we receive your name and email from Google
          so we can create or open your account. We do not get your Google
          password.
        </li>
        <li>
          Basic technical information, like the type of device or browser you
          use, which helps keep the app working.
        </li>
      </UL>

      <H2>How we use your information</H2>
      <UL>
        <li>To create your account and let you sign in.</li>
        <li>To show merchant prices and let farmers and merchants contact each other.</li>
        <li>To check and verify merchants before they are allowed to post prices.</li>
        <li>To keep the service safe, fix problems, and make it better.</li>
        <li>To contact you about your account when we need to.</li>
      </UL>

      <H2>What other people can see</H2>
      <P>
        Some information is meant to be shared. When a merchant is approved, their
        business name, town, district, crops, and contact details are shown to
        farmers so they can get in touch. Please only post details you are happy
        for other users to see. Farmer accounts are not shown publicly.
      </P>

      <H2>Who we share it with</H2>
      <P>
        We do not sell your personal information. We share it only with trusted
        companies that help us run the app, such as our hosting and database
        provider and Google for sign in. We may also share information if the law
        requires it, or to protect the safety of our users.
      </P>

      <H2>Your choices</H2>
      <UL>
        <li>You can view and update most of your details from your account page.</li>
        <li>You can ask us to delete your account and personal information.</li>
        <li>You can stop using Google Sign In and use email and password instead.</li>
      </UL>

      <H2>Keeping your information safe</H2>
      <P>
        We take reasonable steps to protect your information and store it with our
        hosting provider. No service on the internet can be perfectly secure, so
        we cannot promise total security, but we work to keep your data protected.
      </P>

      <H2>Who can use Urimalu</H2>
      <P>
        Urimalu is meant for adults who farm or trade crops. It is not intended
        for children under 18. If you believe a child has given us their
        information, please contact us so we can remove it.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        We may update this policy from time to time. When we do, we will change
        the date at the top of this page. Please check back now and then.
      </P>

      <H2>Which laws apply</H2>
      <P>
        We handle your information in line with Indian law, including the
        Information Technology Act 2000 and the Information Technology Rules made
        under it. Any disputes about your privacy will be handled by the courts
        of India.
      </P>

      <H2>Contact us</H2>
      <P>
        If you have any questions about your privacy, email us at{" "}
        <a className="font-semibold text-coorg-700 hover:text-coorg-800" href="mailto:noreply.rentritz@gmail.com">
          noreply.rentritz@gmail.com
        </a>
        .
      </P>
    </LegalPage>
  );
}
