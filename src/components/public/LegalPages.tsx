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
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Information We Collect', body: <>
          <P><strong>1.1 Account Information</strong></P>
          <P>When you create an account, we collect your email address and encrypted password. This information is necessary to provide you with access to our services and to communicate with you about your account.</P>
          <P><strong>1.2 Email Data</strong></P>
          <P>With your explicit consent, we access and process emails through your connected email accounts (Gmail SMTP and Amazon SES). This includes email content, metadata (sender, recipient, subject, date), and attachments. We only access emails necessary to provide our services.</P>
          <P><strong>1.3 Contact Information</strong></P>
          <P>We store contact information you scrape from Zillow or add manually, including names, email addresses, phone numbers (cell, business, brokerage), business names, screen names, profile URLs, and full agent data from the Zillow API. We also store property listing data linked to contacts, including addresses, prices, and property details.</P>
          <P><strong>1.4 Campaign and Template Data</strong></P>
          <P>We store email templates (HTML, DOCX, PDF), campaign configurations (send windows, delays, test mode settings), AI prompts, and generated draft emails. This data helps you manage and automate your outreach.</P>
          <P><strong>1.5 Instagram Data</strong></P>
          <P>If you connect an Instagram Business or Creator account, we collect and store webhook events including comments, direct messages, and mentions. This includes sender usernames, message text, and media references.</P>
          <P><strong>1.6 Usage Data</strong></P>
          <P>We automatically collect information about how you interact with our services, including feature usage, settings preferences, email processing statistics, and device information.</P>
        </> },
        { heading: '2. How We Use Your Information', body: <>
          <P>We use the collected information for the following purposes:</P>
          <P><strong>Service Delivery:</strong> To provide and maintain the platform, including lead scraping, contact management, email campaign automation, and analytics.</P>
          <P><strong>Email Processing:</strong> To send emails through your connected Gmail and Amazon SES accounts, track delivery, opens, clicks, bounces, and replies, and generate AI-powered auto-responses.</P>
          <P><strong>Contact Management:</strong> To store, enrich, and organize contact data scraped from Zillow, and to score data quality for campaign readiness.</P>
          <P><strong>AI Processing:</strong> To generate email templates, auto-responses, and draft replies using OpenAI's GPT-4o API.</P>
          <P><strong>Personalization:</strong> To merge contact and listing data into templates with smart fallbacks and conditional sections.</P>
          <P><strong>Communication:</strong> To send you service-related communications, updates, and security notifications.</P>
          <P><strong>Security:</strong> To monitor for fraud, abuse, and unauthorized access, and to enforce row-level security policies.</P>
          <P><strong>Analytics:</strong> To track email performance metrics and provide you with actionable insights about your outreach campaigns.</P>
        </> },
        { heading: '3. Data Storage and Security', body: <>
          <P><strong>3.1 Data Storage</strong></P>
          <P>Your data is stored securely using Supabase, a leading database platform built on PostgreSQL. All data is stored in encrypted databases with enterprise-grade security measures.</P>
          <P><strong>3.2 Encryption</strong></P>
          <P>We use industry-standard encryption protocols:</P>
          <P>All data transmission uses TLS/SSL encryption.</P>
          <P>Passwords are hashed using bcrypt before storage.</P>
          <P>Database connections are encrypted.</P>
          <P>SMTP credentials and OAuth tokens are stored encrypted and refreshed automatically.</P>
          <P>API keys (OpenAI, RapidAPI, Amazon SES, AWS) are stored as encrypted edge function secrets, never exposed to the browser.</P>
          <P><strong>3.3 Access Controls</strong></P>
          <P>We implement Row Level Security (RLS) policies ensuring that users can only access their own data. No user can view or modify another user's information. All database queries are authenticated and authorized.</P>
          <P><strong>3.4 Third-Party Services</strong></P>
          <P>We use the following third-party services with appropriate security measures:</P>
          <P><strong>Amazon SES:</strong> Email delivery infrastructure with TLS encryption.</P>
          <P><strong>Gmail SMTP:</strong> Email sending through your Gmail accounts using app-specific passwords.</P>
          <P><strong>OpenAI API:</strong> AI processing for template generation and auto-responses.</P>
          <P><strong>RapidAPI / Zillow:</strong> Lead scraping data source.</P>
          <P><strong>AWS S3:</strong> Email attachment storage with presigned download URLs.</P>
          <P><strong>Instagram / Meta Graph API:</strong> Social engagement webhook events.</P>
        </> },
        { heading: '4. Data Sharing and Disclosure', body: <>
          <P>We do not sell, rent, or trade your personal information. We may share your information only in the following circumstances:</P>
          <P><strong>With Your Consent:</strong> When you explicitly authorize sharing.</P>
          <P><strong>Service Providers:</strong> With third-party services that process data on our behalf (Amazon SES, OpenAI, RapidAPI, AWS) to deliver the Service.</P>
          <P><strong>Legal Requirements:</strong> When required by law, court order, or government regulation.</P>
          <P><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</P>
          <P><strong>Protection:</strong> To protect the rights, property, or safety of our users or others.</P>
        </> },
        { heading: '5. Your Rights and Choices', body: <>
          <P>You have the following rights regarding your personal information:</P>
          <P><strong>Access:</strong> You can request a copy of your personal data.</P>
          <P><strong>Correction:</strong> You can update or correct inaccurate information.</P>
          <P><strong>Deletion:</strong> You can request deletion of your account and associated data.</P>
          <P><strong>Export:</strong> You can export your contacts, templates, and campaign data.</P>
          <P><strong>Revoke Access:</strong> You can disconnect Gmail, SES, Instagram, or other integrations at any time.</P>
          <P><strong>Opt-Out:</strong> You can opt out of non-essential communications.</P>
        </> },
        { heading: '6. Data Retention', body: <>
          <P>We retain your information for as long as your account is active or as needed to provide services. Specifically:</P>
          <P><strong>Account Data:</strong> Retained until you delete your account.</P>
          <P><strong>Emails:</strong> Sent and received emails retained for the life of your account for analytics and reply tracking.</P>
          <P><strong>Contacts:</strong> Contact data retained until you delete it or your account.</P>
          <P><strong>Logs:</strong> System and security logs retained for up to 90 days.</P>
          <P><strong>Deleted Data:</strong> Deleted data is removed from active systems within 30 days, except where required for legal compliance.</P>
        </> },
        { heading: '7. International Data Transfers', body: <P>Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy and applicable data protection laws.</P> },
        { heading: "8. Children's Privacy", body: <P>Our services are not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please contact us immediately.</P> },
        { heading: '9. Changes to This Privacy Policy', body: <P>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on this page and updating the "Last updated" date. We encourage you to review this policy periodically.</P> },
        { heading: '10. Contact Us', body: <P>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at support@loiblast.com.</P> },
        { heading: 'Data Processing Summary', body: <>
          <P><strong>Our Commitment to Data Safety:</strong></P>
          <P>All data is encrypted in transit and at rest.</P>
          <P>Row-level security ensures complete data isolation between users.</P>
          <P>OAuth tokens and SMTP credentials are encrypted and automatically refreshed.</P>
          <P>API keys are stored as server-side encrypted secrets, never exposed to the browser.</P>
        </> },
      ]}
    />
  );
}

export function TermsOfService({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Acceptance of Terms', body: <P>By accessing or using this email management and outreach automation platform (the "Service"), you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these Terms of Service, please do not use the Service.</P> },
        { heading: '2. Description of Service', body: <>
          <P>The Service provides tools for real estate lead scraping, email campaign automation, AI-powered auto-responding, and outreach analytics. Specifically, the Service includes:</P>
          <P>Zillow agent lead scraping via RapidAPI</P>
          <P>Contact enrichment with email and phone number extraction</P>
          <P>Contact management with property listing data</P>
          <P>Email template creation and management (HTML, DOCX, PDF)</P>
          <P>AI-powered email template generation</P>
          <P>Campaign automation with test mode, scheduling, and throttled sending</P>
          <P>Multi-sender email routing (Gmail SMTP and Amazon SES)</P>
          <P>AI-powered auto-responder with single and two-step prompt modes</P>
          <P>Email analytics including delivery, open, click, bounce, and reply tracking</P>
          <P>Instagram webhook integration for social engagement tracking</P>
          <P>Custom AI prompt configuration</P>
          <P>Data quality scoring with campaign gating</P>
          <P>We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) at any time with or without notice.</P>
        </> },
        { heading: '3. User Accounts and Registration', body: <>
          <P><strong>3.1 Account Creation</strong></P>
          <P>To use the Service, you must create an account by providing a valid email address and password. You are responsible for maintaining the confidentiality of your account credentials.</P>
          <P><strong>3.2 Account Responsibility</strong></P>
          <P>You are responsible for all activities that occur under your account. You must immediately notify us of any unauthorized use of your account or any other breach of security.</P>
          <P><strong>3.3 Accurate Information</strong></P>
          <P>You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.</P>
          <P><strong>3.4 Age Requirement</strong></P>
          <P>You must be at least 13 years old to use the Service. By using the Service, you represent and warrant that you meet this age requirement.</P>
        </> },
        { heading: '4. Acceptable Use Policy', body: <>
          <P>You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:</P>
          <P>Use the Service to send spam, unsolicited emails, or bulk commercial messages in violation of CAN-SPAM, GDPR, or other applicable anti-spam laws</P>
          <P>Violate any applicable laws, regulations, or third-party rights</P>
          <P>Upload, transmit, or distribute any malicious code, viruses, or harmful software</P>
          <P>Attempt to gain unauthorized access to the Service, other accounts, or computer systems</P>
          <P>Interfere with or disrupt the Service or servers connected to the Service</P>
          <P>Impersonate any person or entity or misrepresent your affiliation with any person or entity</P>
          <P>Collect or harvest any information about other users without their consent</P>
          <P>Use the Service to harass, abuse, threaten, or intimidate others</P>
          <P>Engage in any activity that could damage, disable, or impair the Service</P>
          <P>Use automated systems or software to extract data from the Service without permission</P>
          <P>Reverse engineer, decompile, or disassemble any aspect of the Service</P>
          <P>Remove or modify any proprietary notices or labels on the Service</P>
          <P>Violation of this Acceptable Use Policy may result in immediate termination of your account without notice.</P>
        </> },
        { heading: '5. Third-Party Integrations', body: <>
          <P><strong>5.1 Google SMTP Integration</strong></P>
          <P>The Service integrates with Gmail through app-specific passwords. By connecting your Gmail account, you grant us permission to send emails on your behalf as configured in your settings. You can revoke this access at any time through your account settings or Google account settings.</P>
          <P><strong>5.2 Amazon SES Integration</strong></P>
          <P>The Service processes emails through Amazon SES. You authorize us to send and receive emails on your behalf as configured in your settings. You are responsible for maintaining valid SES credentials and verified sender addresses.</P>
          <P><strong>5.3 AI Processing</strong></P>
          <P>The Service uses artificial intelligence (OpenAI GPT-4o) to process emails, generate responses, create templates, and categorize content. By using these features, you acknowledge that your email content may be processed by third-party AI services in accordance with our Privacy Policy.</P>
          <P><strong>5.4 Zillow / RapidAPI Integration</strong></P>
          <P>The Service scrapes agent listing data from Zillow via the RapidAPI US Housing Market Data API. You are responsible for maintaining a valid RapidAPI subscription and complying with Zillow's and RapidAPI's terms of service.</P>
          <P><strong>5.5 Instagram Integration</strong></P>
          <P>The Service integrates with Instagram via Meta's Graph API to capture webhook events. You are responsible for maintaining a valid Instagram Business or Creator account and Meta App configuration.</P>
          <P><strong>5.6 Third-Party Terms</strong></P>
          <P>Your use of third-party integrations is subject to the respective third-party terms of service and privacy policies. We are not responsible for the practices or policies of third-party services.</P>
        </> },
        { heading: '6. Data and Privacy', body: <>
          <P>Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy. By using the Service, you consent to our collection and use of information as described in the Privacy Policy.</P>
          <P><strong>6.1 Your Data</strong></P>
          <P>You retain all ownership rights to your data, including emails, contacts, campaign data, templates, and prompts. We claim no ownership rights over your content.</P>
          <P><strong>6.2 Data Security</strong></P>
          <P>We implement reasonable security measures to protect your data, including encryption, row-level security, and encrypted credential storage. However, no system is completely secure, and we cannot guarantee absolute security of your data.</P>
          <P><strong>6.3 Data Backup</strong></P>
          <P>While we perform regular backups, you are responsible for maintaining your own backup copies of important data. We are not liable for any loss of data.</P>
        </> },
        { heading: '7. Intellectual Property', body: <>
          <P><strong>7.1 Service Ownership</strong></P>
          <P>The Service, including its original content, features, and functionality, is owned by us and is protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.</P>
          <P><strong>7.2 Limited License</strong></P>
          <P>We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your personal or business purposes in accordance with these Terms.</P>
          <P><strong>7.3 User Content License</strong></P>
          <P>By uploading or creating content through the Service (such as templates, prompts, or custom settings), you grant us a license to use, store, and process that content solely to provide the Service to you.</P>
        </> },
        { heading: '8. Service Availability and Modifications', body: <>
          <P>We strive to provide reliable service but cannot guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.</P>
          <P>We reserve the right to:</P>
          <P>Modify or discontinue any part of the Service</P>
          <P>Change features, functionality, or user interface</P>
          <P>Implement usage limits or restrictions</P>
          <P>Update these Terms of Service</P>
          <P>We will provide reasonable notice of material changes when possible, but reserve the right to make changes without notice for security or legal reasons.</P>
        </> },
        { heading: '9. Fees and Payment', body: <>
          <P>Certain features of the Service may be provided for a fee. If you choose to use paid features:</P>
          <P>You agree to pay all applicable fees as described at the time of purchase</P>
          <P>All fees are non-refundable unless otherwise stated</P>
          <P>We reserve the right to change our fees with notice</P>
          <P>Failure to pay fees may result in suspension or termination of your account</P>
        </> },
        { heading: '10. Termination', body: <>
          <P><strong>10.1 Termination by You</strong></P>
          <P>You may terminate your account at any time through your account settings. Upon termination, your data will be deleted in accordance with our data retention policies.</P>
          <P><strong>10.2 Termination by Us</strong></P>
          <P>We may terminate or suspend your account at any time, with or without cause or notice, including for violations of these Terms or our Acceptable Use Policy.</P>
        </> },
        { heading: '11. Contact', body: <P>Questions about these Terms? Contact us at support@loiblast.com.</P> },
      ]}
    />
  );
}

export function CookiePolicy({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Cookie Policy"
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: 'What Are Cookies', body: <P>Cookies are small text files that are placed on your computer or mobile device when you visit a website. They are widely used to make websites work more efficiently and provide information to the website owners.</P> },
        { heading: 'How We Use Cookies', body: <>
          <P>LoiBlast uses cookies to enhance your experience on our platform. We use cookies for the following purposes:</P>
          <P><strong>Essential Cookies:</strong> Required for the platform to function, including authentication, session management, and security.</P>
          <P><strong>Performance Cookies:</strong> Collect information about how visitors use our platform so we can improve performance and user experience.</P>
          <P><strong>Functional Cookies:</strong> Remember your preferences and settings, such as dark mode and notification preferences.</P>
          <P><strong>Analytics Cookies:</strong> Help us understand user behavior and feature usage to improve our services.</P>
        </> },
        { heading: 'Types of Cookies We Use', body: <>
          <P><strong>Session Cookies</strong></P>
          <P>These are temporary cookies that remain in your browser only until you close it. They help us maintain your session and remember your activities during your visit.</P>
          <P><strong>Persistent Cookies</strong></P>
          <P>These cookies remain on your device for a set period or until you delete them. They help us recognize you when you return to our website and remember your preferences.</P>
          <P><strong>Third-Party Cookies</strong></P>
          <P>We may use third-party services that set cookies on our behalf for analytics and functionality purposes. These third parties include:</P>
          <P>Authentication providers (Google OAuth)</P>
          <P>Analytics services to understand user behavior</P>
          <P>Service providers that help us deliver our platform</P>
        </> },
        { heading: 'Managing Cookies', body: <>
          <P>You have the right to decide whether to accept or reject cookies. You can exercise your cookie preferences by:</P>
          <P>Setting or amending your web browser controls to accept or refuse cookies</P>
          <P>Deleting cookies from your browser at any time</P>
          <P>Blocking cookies by activating the setting on your browser that allows you to refuse all or some cookies</P>
          <P>Please note that if you choose to block cookies, you may not be able to access all or parts of our website, and some functionality may not work as intended.</P>
        </> },
        { heading: 'Browser Controls', body: <>
          <P>Most web browsers allow you to manage your cookie preferences. You can set your browser to refuse cookies or delete certain cookies. Here are links to cookie management in popular browsers:</P>
          <P>Google Chrome: Settings then Privacy and security then Cookies and other site data</P>
          <P>Mozilla Firefox: Options then Privacy and Security then Cookies and Site Data</P>
          <P>Safari: Preferences then Privacy then Manage Website Data</P>
          <P>Microsoft Edge: Settings then Privacy, search, and services then Cookies and site permissions</P>
        </> },
        { heading: 'Cookie Retention', body: <P>The length of time a cookie remains on your device depends on its type. Session cookies are automatically deleted when you close your browser, while persistent cookies remain until they expire or you delete them.</P> },
        { heading: 'Updates to This Policy', body: <P>We may update this Cookie Policy from time to time. Changes will be posted on this page with an updated revision date.</P> },
        { heading: 'Contact Us', body: <P>If you have any questions about our use of cookies or this Cookie Policy, please contact us at support@loiblast.com.</P> },
      ]}
    />
  );
}

export function DataProcessingAgreement({ currentRoute, onNavigate }: LegalPagesProps) {
  return (
    <LegalPage
      title="Data Processing Agreement"
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Purpose and Scope', body: <P>This Data Processing Agreement ("DPA") forms part of the Terms of Service and governs LoiBlast's processing of personal data on behalf of its users ("Controllers"). LoiBlast acts as a Data Processor, and the user acts as a Data Controller.</P> },
        { heading: '2. Processing Details', body: <>
          <P><strong>Categories of data:</strong> Contact names, email addresses, phone numbers, business information, property listing data, email engagement data (opens, clicks, bounces, replies), and message content.</P>
          <P><strong>Purpose of processing:</strong> To provide lead scraping, email campaign automation, contact management, AI auto-responding, analytics, and Instagram engagement tracking services as described in the Terms of Service.</P>
          <P><strong>Duration:</strong> Data is processed for the duration of the user's subscription and retained according to the retention policy in the Privacy Policy.</P>
        </> },
        { heading: '3. Processor Obligations', body: <P>LoiBlast agrees to: process personal data only on documented instructions from the Controller, ensure personnel processing data are bound by confidentiality, implement appropriate technical and organizational security measures (including encryption and row-level security), assist the Controller in responding to data subject requests, and notify the Controller without undue delay of any personal data breach.</P> },
        { heading: '4. Sub-Processors', body: <P>LoiBlast may engage sub-processors to provide parts of the Service (including Amazon SES, OpenAI, RapidAPI, AWS S3, and Meta/Instagram). We remain responsible for sub-processors' compliance with this DPA. A current list of sub-processors is available upon request.</P> },
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
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Free Tier', body: <P>LoiBlast offers a free tier that allows you to explore the platform before subscribing to a paid plan. We encourage you to use the free tier thoroughly before upgrading to ensure the Service meets your needs.</P> },
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
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: '1. Overview', body: <P>This Acceptable Use Policy ("AUP") describes prohibited uses of LoiBlast. By using the Service, you agree to comply with this AUP. Violations may result in account suspension or termination.</P> },
        { heading: '2. Prohibited Conduct', body: <>
          <P>You must not use the Service to:</P>
          <P>1. Send unsolicited commercial email (spam) in violation of the CAN-SPAM Act, GDPR, or other applicable anti-spam laws.</P>
          <P>2. Send emails with false or misleading header information, deceptive subject lines, or without a valid postal address and unsubscribe mechanism.</P>
          <P>3. Scrape or collect contact data in a manner that violates the terms of service of any third-party website or platform, including Zillow's terms of service.</P>
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
      lastUpdated="August 1, 2026"
      currentRoute={currentRoute}
      onNavigate={onNavigate}
      sections={[
        { heading: 'Our Commitment to Accessibility', body: <P>LoiBlast is committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone and apply relevant accessibility standards to meet the requirements of the Americans with Disabilities Act (ADA) and Web Content Accessibility Guidelines (WCAG) 2.1, Level AA.</P> },
        { heading: 'Conformance Status', body: <P>We strive to conform to the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA. These guidelines explain how to make web content more accessible to people with disabilities. Conformance with these guidelines helps make the web more user-friendly for everyone.</P> },
        { heading: 'Accessibility Features', body: <>
          <P>LoiBlast incorporates the following accessibility features:</P>
          <P>Keyboard navigation support throughout the application</P>
          <P>Screen reader compatibility using semantic HTML and ARIA labels</P>
          <P>Sufficient color contrast ratios meeting WCAG 2.1 AA standards</P>
          <P>Resizable text without loss of content or functionality</P>
          <P>Descriptive alt text for all meaningful images and icons</P>
          <P>Focus indicators visible on all interactive elements</P>
          <P>Forms with clearly associated labels and error messages</P>
          <P>No content that flashes more than three times per second</P>
          <P>Skip navigation links to bypass repetitive content</P>
          <P>Consistent navigation and page structure across the platform</P>
        </> },
        { heading: 'Assistive Technologies', body: <>
          <P>LoiBlast has been tested with the following assistive technologies:</P>
          <P>NVDA (NonVisual Desktop Access) screen reader</P>
          <P>JAWS (Job Access With Speech) screen reader</P>
          <P>VoiceOver (macOS and iOS)</P>
          <P>TalkBack (Android)</P>
          <P>Windows High Contrast Mode</P>
          <P>Browser zoom up to 200%</P>
        </> },
        { heading: 'Known Limitations', body: <>
          <P>While we strive for full accessibility, some areas of the platform may still present challenges. We are actively working to address the following known limitations:</P>
          <P>Some rich text editor features may have limited screen reader support — we are working on improvements.</P>
          <P>Certain dynamically loaded content may require manual page refresh for screen readers to detect updates.</P>
          <P>PDF exports may not be fully tagged for accessibility — we recommend using the HTML view when available.</P>
        </> },
        { heading: 'Alternative Access', body: <P>If you are having difficulty accessing any part of LoiBlast, we are here to help. Please contact our support team and we will work with you to provide the information or functionality you need in an accessible format.</P> },
        { heading: 'Feedback and Contact Information', body: <>
          <P>We welcome your feedback on the accessibility of LoiBlast. If you experience accessibility barriers or have suggestions for improvement, please contact us:</P>
          <P>Email: support@loiblast.com</P>
          <P>We aim to respond to accessibility feedback within 2 business days.</P>
        </> },
        { heading: 'Formal Complaints', body: <P>If you wish to file a formal complaint regarding accessibility, you may do so through the U.S. Department of Justice at www.ada.gov.</P> },
      ]}
    />
  );
}
