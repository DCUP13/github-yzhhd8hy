import React from 'react';
import { LegalPage } from './LegalPage';
import type { PublicRoute } from '../../lib/router';

interface LegalPagesProps {
  currentRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

const P = ({ children }: { children: React.ReactNode }) => <p>{children}</p>;

export function PrivacyPolicy({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Introduction', body: <P>LoiBlast ("we", "us", or "our") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and disclose your information when you use our platform and services. By using LoiBlast, you agree to the practices described in this policy.</P> },
        { heading: '2. Information We Collect', body: <>
          <P><strong>Account information:</strong> Your name, email address, and password when you create an account.</P>
          <P><strong>Campaign and contact data:</strong> Contact information you scrape or upload, email content you create, and campaign settings you configure.</P>
          <P><strong>Usage data:</strong> Information about how you interact with the platform, including login times, features used, and device information.</P>
          <P><strong>Email engagement data:</strong> Open events, click events, and reply data from emails sent through the platform.</P>
          <P><strong>Integration data:</strong> Data from connected accounts such as Amazon SES, Gmail, and Instagram, used to provide and improve our services.</P>
        </> },
        { heading: '3. How We Use Your Information', body: <>
          <P>We use your information to: provide and maintain the service, process your email campaigns, track email engagement, send you service-related communications, detect and prevent fraud or abuse, comply with legal obligations, and improve and develop new features.</P>
          <P>We do not sell your personal data to third parties. We may share data with service providers who process data on our behalf (such as email delivery providers and analytics services), all of whom are bound by confidentiality obligations.</P>
        </> },
        { heading: '4. Email Tracking', body: <P>LoiBlast tracks email opens and clicks using tracking pixels and redirect links. This allows us to provide analytics on campaign performance. Recipients of your emails may have their email client configured to block tracking pixels, in which case open events may not be recorded.</P> },
        { heading: '5. Data Retention', body: <P>We retain your data for as long as your account is active. If you delete your account, we will remove your personal data within 30 days, except where we are required to retain it for legal, accounting, or compliance purposes.</P> },
        { heading: '6. Data Security', body: <P>We use industry-standard security measures including encryption in transit (TLS) and at rest, role-based access controls, and regular security reviews. Despite these measures, no system is perfectly secure, and we cannot guarantee absolute security of your data.</P> },
        { heading: '7. Your Rights', body: <>
          <P>Depending on your jurisdiction, you may have the right to: access your personal data, request correction or deletion, restrict or object to processing, request data portability, and withdraw consent. To exercise any of these rights, contact us at support@loiblast.com.</P>
        </> },
        { heading: '8. Cookies', body: <P>We use cookies and similar technologies to operate the platform, remember your preferences, and analyze usage. See our Cookie Policy for details.</P> },
        { heading: '9. Children\'s Privacy', body: <P>LoiBlast is not intended for use by anyone under 16 years of age. We do not knowingly collect data from children. If you believe we have collected data from a minor, please contact us.</P> },
        { heading: '10. Changes to This Policy', body: <P>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on this page and updating the "last updated" date. We encourage you to review this policy periodically.</P> },
        { heading: '11. Contact Us', body: <P>If you have questions about this Privacy Policy, contact us at support@loiblast.com.</P> },
      ]}
    />
  );
}

export function TermsOfService({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Acceptance of Terms', body: <P>By creating an account or using LoiBlast ("the Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, do not use the Service.</P> },
        { heading: '2. Eligibility', body: <P>You must be at least 16 years old and legally capable of entering into contracts to use the Service. By using the Service, you represent and warrant that you meet these requirements.</P> },
        { heading: '3. Your Account', body: <P>You are responsible for maintaining the security of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</P> },
        { heading: '4. Acceptable Use', body: <>
          <P>You agree not to use the Service to: send unsolicited spam or emails that violate anti-spam laws (including CAN-SPAM and GDPR), scrape or collect data in violation of third-party terms of service, send content that is illegal, defamatory, or infringes intellectual property rights, attempt to disrupt or compromise the Service's security, or use the Service for any fraudulent or deceptive purpose.</P>
          <P>See our Acceptable Use Policy for detailed guidelines.</P>
        </> },
        { heading: '5. Email Compliance', body: <P>You are solely responsible for ensuring that your email campaigns comply with all applicable laws, including the CAN-SPAM Act, GDPR, and CCPA. This includes providing accurate sender information, honoring unsubscribe requests, and including valid physical addresses where required.</P> },
        { heading: '6. Subscriptions and Billing', body: <>
          <P>Paid subscriptions are billed in advance on a monthly or annual basis depending on your selected plan. All fees are non-refundable except as described in our Refund Policy. We may change our pricing at any time, but any changes will not affect your current billing period.</P>
          <P>You can upgrade, downgrade, or cancel your subscription at any time from your account settings.</P>
        </> },
        { heading: '7. Intellectual Property', body: <P>The Service, including its design, features, and underlying technology, is owned by LoiBlast and protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the Service for your business purposes during your subscription.</P> },
        { heading: '8. Your Content', body: <P>You retain ownership of all content you create or upload to the Service, including email templates, campaign data, and contact lists. You grant us a license to process your content as necessary to provide the Service.</P> },
        { heading: '9. Disclaimers', body: <P>The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or that emails sent through the Service will be delivered successfully.</P> },
        { heading: '10. Limitation of Liability', body: <P>To the maximum extent permitted by law, LoiBlast shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, arising from your use of the Service. Our total liability shall not exceed the amount you paid in the preceding 12 months.</P> },
        { heading: '11. Termination', body: <P>We may suspend or terminate your account if you violate these Terms. You may cancel your account at any time. Upon termination, your right to use the Service ends immediately.</P> },
        { heading: '12. Changes to These Terms', body: <P>We may update these Terms from time to time. We will notify you of material changes by email or by posting a notice within the Service. Continued use after changes constitutes acceptance.</P> },
        { heading: '13. Contact', body: <P>Questions about these Terms? Contact us at support@loiblast.com.</P> },
      ]}
    />
  );
}

export function CookiePolicy({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Cookie Policy"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. What Are Cookies', body: <P>Cookies are small text files stored on your device when you visit a website. They allow the website to remember your actions and preferences over a period of time, so you don't have to re-enter them every time you visit.</P> },
        { heading: '2. How We Use Cookies', body: <>
          <P>LoiBlast uses cookies for the following purposes:</P>
          <P><strong>Essential cookies:</strong> Required for the platform to function, including authentication and session management.</P>
          <P><strong>Preference cookies:</strong> Remember your settings such as theme (dark mode) and language.</P>
          <P><strong>Analytics cookies:</strong> Help us understand how visitors interact with the platform so we can improve it.</P>
        </> },
        { heading: '3. Managing Cookies', body: <P>You can control and delete cookies through your browser settings. Note that disabling essential cookies may prevent the platform from functioning correctly. Most browsers allow you to refuse cookies or alert you when cookies are being sent.</P> },
        { heading: '4. Third-Party Cookies', body: <P>Some features of the platform may involve third-party services that set their own cookies, such as email delivery providers and analytics services. We do not control these cookies and recommend reviewing the third party's privacy policy.</P> },
        { heading: '5. Changes', body: <P>We may update this Cookie Policy from time to time. Changes will be posted on this page with an updated revision date.</P> },
      ]}
    />
  );
}

export function DataProcessingAgreement({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Data Processing Agreement"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Purpose and Scope', body: <P>This Data Processing Agreement ("DPA") forms part of the Terms of Service and governs LoiBlast's processing of personal data on behalf of its users ("Controllers"). LoiBlast acts as a Data Processor, and the user acts as a Data Controller.</P> },
        { heading: '2. Processing Details', body: <>
          <P><strong>Categories of data:</strong> Contact names, email addresses, phone numbers, business information, email engagement data (opens, clicks), and message content.</P>
          <P><strong>Purpose of processing:</strong> To provide email campaign automation, contact management, analytics, and auto-responding services as described in the Terms of Service.</P>
          <P><strong>Duration:</strong> Data is processed for the duration of the user's subscription and retained according to the retention policy in the Privacy Policy.</P>
        </> },
        { heading: '3. Processor Obligations', body: <P>LoiBlast agrees to: process personal data only on documented instructions from the Controller, ensure personnel processing data are bound by confidentiality, implement appropriate technical and organizational security measures, assist the Controller in responding to data subject requests, and notify the Controller without undue delay of any personal data breach.</P> },
        { heading: '4. Sub-Processors', body: <P>LoiBlast may engage sub-processors to provide parts of the Service (such as email delivery and hosting). We remain responsible for sub-processors' compliance with this DPA. A current list of sub-processors is available upon request.</P> },
        { heading: '5. International Data Transfers', body: <P>Data may be processed in countries outside your jurisdiction. Where this occurs, appropriate safeguards such as Standard Contractual Clauses are in place to ensure adequate protection of personal data.</P> },
        { heading: '6. Data Subject Rights', body: <P>LoiBlast will assist the Controller in fulfilling its obligations to respond to data subject requests, including requests for access, rectification, erasure, and data portability. Contact us at support@loiblast.com to exercise these rights.</P> },
        { heading: '7. Audit Rights', body: <P>The Controller may audit LoiBlast's compliance with this DPA, subject to reasonable notice and confidentiality obligations. Alternatively, we may provide third-party audit reports upon request.</P> },
        { heading: '8. Breach Notification', body: <P>In the event of a personal data breach, LoiBlast will notify the Controller without undue delay and provide all relevant information needed for the Controller to comply with its own breach notification obligations.</P> },
      ]}
    />
  );
}

export function RefundPolicy({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Refund Policy"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Free Trial', body: <P>LoiBlast offers a free tier that allows you to explore the platform before subscribing to a paid plan. We encourage you to use the free tier thoroughly before upgrading to ensure the Service meets your needs.</P> },
        { heading: '2. Subscription Refunds', body: <>
          <P>Monthly subscriptions: You may request a full refund within 7 days of your initial subscription payment. After 7 days, monthly fees are non-refundable.</P>
          <P>Annual subscriptions: You may request a full refund within 14 days of your initial subscription payment. After 14 days, annual fees are non-refundable.</P>
          <P>Refunds for subsequent renewal payments are not available. To avoid being charged for the next period, cancel your subscription before the renewal date.</P>
        </> },
        { heading: '3. How to Request a Refund', body: <P>To request a refund, contact us at support@loiblast.com within the applicable refund window. Include your account email and the reason for your request. Approved refunds will be processed to your original payment method within 5-10 business days.</P> },
        { heading: '4. Cancellation', body: <P>You can cancel your subscription at any time from your account settings. Cancellation stops future billing but does not automatically generate a refund. You will retain access to the Service until the end of your current billing period.</P> },
        { heading: '5. Plan Changes', body: <P>If you upgrade your plan mid-cycle, the difference will be prorated. If you downgrade, the change takes effect at the next billing cycle and no refund is issued for the current period.</P> },
        { heading: '6. Exceptions', body: <P>Refunds are not available for accounts terminated due to violations of the Terms of Service or Acceptable Use Policy.</P> },
      ]}
    />
  );
}

export function AcceptableUsePolicy({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Overview', body: <P>This Acceptable Use Policy ("AUP") describes prohibited uses of LoiBlast. By using the Service, you agree to comply with this AUP. Violations may result in account suspension or termination.</P> },
        { heading: '2. Prohibited Conduct', body: <>
          <P>You must not use the Service to:</P>
          <P>1. Send unsolicited commercial email (spam) in violation of the CAN-SPAM Act, GDPR, or other applicable anti-spam laws.</P>
          <P>2. Send emails with false or misleading header information, deceptive subject lines, or without a valid postal address and unsubscribe mechanism.</P>
          <P>3. Scrape or collect contact data in a manner that violates the terms of service of any third-party website or platform.</P>
          <P>4. Send content that is illegal, harassing, defamatory, or that infringes on the intellectual property rights of others.</P>
          <P>5. Distribute malware, viruses, or any other malicious code.</P>
          <P>6. Attempt to gain unauthorized access to the Service, other users' accounts, or our systems.</P>
          <P>7. Use the Service to interfere with or disrupt the services of any third party.</P>
          <P>8. Resell or sublicense the Service without our written consent.</P>
          <P>9. Use the Service in connection with any fraudulent, deceptive, or illegal activity.</P>
        </> },
        { heading: '3. Email Best Practices', body: <>
          <P>To maintain strong deliverability and comply with email regulations, we require users to:</P>
          <P>1. Only email contacts who have a reasonable business relationship or who fall within legitimate B2B outreach practices.</P>
          <P>2. Include accurate sender identification in all emails.</P>
          <P>3. Honor all unsubscribe and opt-out requests promptly.</P>
          <P>4. Avoid sending excessively high volumes from a single address that could trigger spam filters.</P>
          <P>5. Use the Service's send-time windows and delay features to maintain natural sending patterns.</P>
        </> },
        { heading: '4. Contact Data', body: <P>You are responsible for ensuring that the contact data you scrape, upload, or email through the Service is obtained lawfully and that your use of such data complies with all applicable privacy laws, including GDPR and CCPA.</P> },
        { heading: '5. Enforcement', body: <P>We reserve the right to investigate suspected violations and to suspend or terminate accounts that violate this AUP. We may also report illegal activities to law enforcement authorities where required by law.</P> },
        { heading: '6. Reporting Violations', body: <P>To report a violation of this AUP, contact us at support@loiblast.com. Please include details of the violation and any supporting evidence.</P> },
      ]}
    />
  );
}

export function AccessibilityADA({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Accessibility (ADA)"
      lastUpdated="July 30, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Our Commitment', body: <P>LoiBlast is committed to making our platform accessible to everyone, including individuals with disabilities. We strive to comply with the Americans with Disabilities Act (ADA) and the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.</P> },
        { heading: '2. Measures We Take', body: <>
          <P>We take the following measures to ensure accessibility:</P>
          <P>1. Our interface is designed to be navigable by keyboard alone, without requiring a mouse.</P>
          <P>2. We maintain sufficient color contrast between text and background elements.</P>
          <P>3. Interactive elements have visible focus states for keyboard users.</P>
          <P>4. Forms are labelled properly and are compatible with screen readers.</P>
          <P>5. Our layout is responsive and works across devices and screen sizes.</P>
        </> },
        { heading: '3. Known Limitations', body: <P>While we strive for full accessibility, some third-party integrations and embedded content may not fully conform to accessibility standards. We are continuously working to improve and address any gaps.</P> },
        { heading: '4. Feedback', body: <P>If you encounter any accessibility barriers or have suggestions for improvement, please contact us at support@loiblast.com. We take accessibility feedback seriously and will work to address issues promptly.</P> },
        { heading: '5. Ongoing Efforts', body: <P>Accessibility is an ongoing effort. We regularly review our platform, train our team on accessibility best practices, and update our standards as technology and guidelines evolve.</P> },
      ]}
    />
  );
}
