// Struo's legal pages in English (spec 060): the same pages and sections as legal.fr.ts.
// Plain HTML fragments written by us (no user input).
import type { LegalPages } from './legal.ts';

const M = '<a href="mailto:contact@kete.digital">contact@kete.digital</a>';
const table = (head: string[], rows: string[][]) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((cell) => `<th scope="col">${cell}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export const legalEn: LegalPages = {
  notice: {
    slug: 'mentions-legales',
    title: 'Legal notice',
    lead: 'Who publishes Struo, who hosts it, and how to reach us.',
    summary: [],
    sections: [
      { id: 'editeur', title: 'Publisher', html: `<p>Struo is an online management software for construction companies, published by <strong>Kete</strong> (<a href="https://kete.digital">kete.digital</a>), an independent activity.</p>
<ul>
  <li><strong>Contact:</strong> ${M}</li>
</ul>` },
      { id: 'hebergement', title: 'Hosting', html: `<ul>
  <li><strong>Application server:</strong> Contabo GmbH, Aschauer Straße 32a, 81549 Munich, Germany.</li>
  <li><strong>Database and files:</strong> Neon, Inc. The data is stored in a data centre in Frankfurt, Germany (European Union).</li>
  <li><strong>Audience measurement:</strong> Umami, installed and run by Kete on its own server.</li>
</ul>` },
      { id: 'propriete', title: 'Intellectual property', html: `<p>The Struo name, the logo, the texts, the interface and the code of the site belong to Kete. Any reproduction without written consent is forbidden.</p>
<p>The photos on the site are illustrations. They show neither Struo customers nor real sites.</p>
<p>The data our customers record in Struo belongs to them. See the <a href="/conditions">terms</a>.</p>` },
      { id: 'chiffres', title: 'Figures quoted', html: `<p>The figures on time lost in construction come from the <em>Construction Disconnected</em> study (PlanGrid and FMI, 2018), carried out with nearly 600 leaders. The site’s calculator gives an indicative estimate: it is neither a promise nor a guarantee of results.</p>` },
      { id: 'signaler', title: 'Report content or a flaw', html: `<p>To report unlawful content or a security flaw, write to ${M} describing the problem. Please do not exploit a flaw beyond what is needed to show it.</p>` },
    ],
  },

  privacy: {
    slug: 'confidentialite',
    title: 'Privacy policy',
    lead: 'What data Struo processes, why, for how long, and how to exercise your rights. This policy follows the General Data Protection Regulation (GDPR) and applies in every country where Struo is used.',
    summary: [
      'The data of your sites belongs to your company. We process it only to run Struo.',
      'We sell no data and we do no advertising.',
      'The public site is measured without cookies and without following anyone.',
      'Your data is stored in the European Union.',
      'You can export all of your company’s data in one click, at any time.',
    ],
    sections: [
      { id: 'roles', title: 'Who is responsible for your data', html: `<p>Struo is published by Kete (${M}). Depending on the data, our role changes:</p>
<ul>
  <li><strong>Kete is the controller</strong> for the data of site visitors, of people who ask to be called back, and of accounts (identity, sign-in, licence billing).</li>
  <li><strong>Kete is a processor</strong> for everything a company records in Struo: its sites, team, clients, photos, documents and invoices. The customer company is then the controller, and Kete acts on its instructions, under the <a href="/traitement-donnees">data processing agreement</a>.</li>
</ul>
<p>If you are the end client of a company that uses Struo (for example the owner of a house being built), that company decides how your data is used. Contact it first. If you write to us, we pass your request on to it.</p>` },
      { id: 'donnees', title: 'The data we process', html: `<h3>Visitors of the public site</h3>
<ul>
  <li><strong>Audience measurement:</strong> pages viewed, country, device type and referring page, measured by Umami, installed on our own server, without cookies and without any personal identifier. Only public pages are measured, never the application.</li>
  <li><strong>Call-back request:</strong> name, company, a way to reach you (phone, WhatsApp or e-mail), number of sites and your question if you ask one.</li>
  <li><strong>Country and language choice,</strong> to show the right price and the right language (see <a href="/cookies">cookies</a>).</li>
</ul>
<h3>Accounts and users</h3>
<ul>
  <li>Name, e-mail address, phone if you give it, role in the company, language.</li>
  <li>Password, kept only in an irreversible encrypted form (hash). We do not know it.</li>
  <li>Log of important actions (who approved a report, issued an invoice, changed a right), for traceability within the company.</li>
  <li>Connections to assistants (Claude, ChatGPT or others) and access keys: we keep only a fingerprint of keys, never the key itself.</li>
</ul>
<h3>Data recorded by the company</h3>
<ul>
  <li><strong>Sites:</strong> address and position on the map, phases, planning, progress, budget, expenses, invoices, documents.</li>
  <li><strong>Field reports:</strong> photos with their date, time and GPS position, written notes, voice notes and their transcription, signatures, checklists, workers’ attendance.</li>
  <li><strong>End clients:</strong> name, contact details, site concerned, invoices, messages, stage signatures, visits to the client space.</li>
  <li><strong>Team and subcontractors:</strong> name, trade, contact details, attendance.</li>
</ul>
<p>The GPS position of a photo is used to prove where it was taken. It is recorded only when the photo is taken, never continuously: Struo does not track people’s movements.</p>
<h3>Client space</h3>
<ul>
  <li>Date of the last visit, to point out what is new since.</li>
  <li>Your choice to receive e-mails or not, and the notification subscription if you turn it on on your phone.</li>
  <li>The payment declarations you send, with their proof. Struo collects no payment: you pay the company directly.</li>
</ul>
<h3>Licence payment</h3>
<p>Struo licences are bought on the store of our payment provider, Chariow. Kete receives the confirmation of the purchase (plan, duration, amount, buyer’s e-mail address). We never see your bank details.</p>
<h3>Technical data</h3>
<p>IP address, browser and time of requests in the server logs; technical error reports (Sentry, hosted in the European Union), used to fix failures, which do not contain the content of your sites.</p>` },
      { id: 'finalites', title: 'Why we process it', html: table(['Purpose', 'Legal basis'], [
        ['Providing Struo: accounts, sites, reports, invoices, client space, offline mode', 'Performance of the contract'],
        ['Sending useful e-mails and notifications (invitation, report to approve, invoice, client report, end of licence)', 'Performance of the contract'],
        ['Built-in assistant and voice note transcription, when the company uses them', 'Performance of the contract, on the company’s instructions'],
        ['Calling you back after a request on the site', 'Pre-contractual steps at your request'],
        ['Managing licences, billing and Kete’s accounts', 'Legal obligation and performance of the contract'],
        ['Measuring the audience of the public site, without cookies', 'Legitimate interest: improving the site'],
        ['Securing the service, detecting abuse, fixing errors', 'Legitimate interest: protecting the service and its users'],
        ['Telling you about an important change to the service or to these rules', 'Performance of the contract'],
      ]) + '\n<p>We do no advertising, no resale and no profiling. We do not use the data of your sites to train artificial intelligence models.</p>' },
      { id: 'ia', title: 'Artificial intelligence', html: `<p>Some features rely on an artificial intelligence model: writing client reports, transcribing voice notes, the built-in assistant. They only work if the company’s plan includes them and it uses them.</p>
<ul>
  <li>Only the information needed for the request is sent to the model provider (OpenAI), through its business interface, which does not use this data to train its models.</li>
  <li>A person always approves what the assistant suggests before it goes to a client or changes any data.</li>
  <li>If the company connects its own assistant (Claude, ChatGPT or another) through MCP, the data read goes through the company’s account with that provider, under its responsibility. The company can revoke this connection at any time.</li>
</ul>` },
      { id: 'conservation', title: 'How long we keep it', html: table(['Data', 'Duration'], [
        ['Data of a customer company', 'As long as the company uses Struo. It is deleted at its request, once it has been able to export it.'],
        ['Database restore history', 'Erased automatically by rotation.'],
        ['Call-back request with no follow-up', '3 years after the last exchange.'],
        ['Invoices and proof of licence purchase', 'The period required by the applicable accounting law.'],
        ['Audience measurement', 'Aggregated data, without any personal identifier.'],
        ['On the phone, in offline mode', 'Until it is sent to the server, then deleted from the phone.'],
      ]) + `\n<p>A company can delete a site, a document or a client at any time. To delete its whole space, it writes to ${M}.</p>` },
      { id: 'destinataires', title: 'Who has access', html: `<ul>
  <li><strong>Within the company:</strong> each person sees only what their role allows. An end client sees their site, never the company’s costs or margins.</li>
  <li><strong>At Kete:</strong> only the people in charge of support and operations, when it is needed to answer your request or fix a failure. They are bound to confidentiality.</li>
  <li><strong>Our technical processors,</strong> to host, send e-mails or run the AI features. See <a href="/traitement-donnees#sous-traitants">the list of our processors</a>.</li>
  <li><strong>The authorities,</strong> only on a lawful request and within what it requires.</li>
</ul>` },
      { id: 'transferts', title: 'Transfers outside the European Union', html: `<p>The database and the files are stored in the European Union. Two processors handle data in the United States: e-mail sending (Resend) and the artificial intelligence features (OpenAI). These transfers are covered by the European Commission’s standard contractual clauses, or by the EU–US Data Privacy Framework when the provider has joined it.</p>` },
      { id: 'securite', title: 'How we protect it', html: `<ul>
  <li>Each company is isolated from the others directly in the database: a query can only read the data of the signed-in person’s company.</li>
  <li>All connections are encrypted (HTTPS). The database and the files are encrypted on Neon’s disks. Files are only reachable through temporary links.</li>
  <li>Passwords and access keys stored as irreversible fingerprints.</li>
  <li>Rights by role, log of sensitive actions, revocable client space links.</li>
  <li>Any action by an assistant that commits the company requires a human confirmation.</li>
</ul>` },
      { id: 'droits', title: 'Your rights', html: `<p>At any time, you can ask for:</p>
<ul>
  <li><strong>access</strong> to your data and a copy;</li>
  <li><strong>rectification</strong> of inaccurate data;</li>
  <li><strong>erasure</strong> of your data;</li>
  <li><strong>restriction</strong> of processing, or <strong>object</strong> to it;</li>
  <li><strong>portability</strong>: receiving your data in a machine-readable format;</li>
  <li><strong>withdrawal of your consent</strong> when a processing depends on it, for example the client space e-mails or notifications.</li>
</ul>
<p>Write to ${M}. We answer within one month at most. We may ask you to prove your identity if there is a doubt. For the data of a site, we pass your request on to the company concerned, which decides.</p>
<p>If you believe your rights are not respected, you can contact the data protection authority of your country (in France, the CNIL).</p>` },
      { id: 'mineurs', title: 'Minors', html: '<p>Struo is a professional tool. It is not meant for people under 16.</p>' },
      { id: 'changements', title: 'Changes to this policy', html: '<p>If we change this policy significantly, we tell customer companies by e-mail at least 30 days before. The date of the last update is shown at the top of the page.</p>' },
    ],
  },

  cookies: {
    slug: 'cookies',
    title: 'Cookies and local storage',
    lead: 'Struo uses no advertising or tracking cookies. The only cookies make the service work: that is why no banner asks for your consent.',
    summary: [],
    sections: [
      { id: 'principe', title: 'The principle', html: `<p>A cookie is a small file the site leaves in your browser. The law requires asking for your consent before leaving a cookie, unless it is strictly necessary for the service you ask for. Struo only uses cookies of that kind.</p>
<p>The audience measurement of the public site (Umami) works without cookies and without identifiers: it counts visits, it does not follow a person.</p>` },
      { id: 'liste', title: 'The cookies used', html: table(['Name', 'What it is for', 'Duration'], [
        ['<code>struo.session_token</code> and related session cookies', 'Keeping you securely signed in to your account.', 'The session, at most 7 days without activity'],
        ['<code>struo_org</code>', 'Remembering the company open if you have several.', '1 year'],
        ['<code>struo_lang</code>', 'Remembering your language (French or English).', '1 year'],
        ['<code>struo_country</code>', 'Showing prices in your country’s currency, without conversion.', '1 year'],
        ['<code>struo_siwc</code>', 'Finishing the connection to an external assistant or the choice of a plan during sign-up.', 'A few minutes'],
      ]) },
      { id: 'local', title: 'Storage on the phone', html: `<p>The field app works without network. For that, it keeps on the phone the reports, photos and notes waiting to be sent, and the useful information about the sites. This data leaves for the server as soon as the network is back, then is deleted from the phone. It is never read by another site.</p>
<p>If you install Struo or the client space on your home screen, the browser also keeps a copy of the application’s files to open it faster.</p>` },
      { id: 'notifications', title: 'Notifications', html: '<p>If you turn notifications on, your browser gives us a delivery address specific to this device. You can turn them off at any time in Struo or in the browser’s settings; the address is then deleted.</p>' },
      { id: 'gerer', title: 'Manage or delete', html: '<p>You can clear the site’s cookies and data in your browser’s settings. You will then be signed out, and the reports still waiting on the phone will be lost: send them first.</p>' },
    ],
  },

  terms: {
    slug: 'conditions',
    title: 'Terms of use and sale',
    lead: 'The rules between Kete, which publishes Struo, and the companies that use it. They apply from the creation of a space, including during the trial.',
    summary: [],
    sections: [
      { id: 'definitions', title: 'Definitions', html: `<ul>
  <li><strong>Kete:</strong> the independent activity that publishes and runs Struo (see the <a href="/mentions-legales">legal notice</a>).</li>
  <li><strong>Struo:</strong> the online management software for construction companies, with its field app, its client space and its connections.</li>
  <li><strong>Customer:</strong> the company that creates a Struo space and accepts these terms.</li>
  <li><strong>User:</strong> a person invited by the Customer into its space (owner, engineer, site lead, accountant).</li>
  <li><strong>End client:</strong> the Customer’s client, who follows their site in the client space.</li>
  <li><strong>Licence:</strong> the right to use a Struo plan for a period paid in advance.</li>
</ul>` },
      { id: 'acces', title: 'Access to the service', html: `<p>Struo is reserved for professionals. The person who creates the space declares they have the power to commit the company.</p>
<p><strong>Trial:</strong> 14 days free, with every feature, no bank card. The end rules are the same as for a licence (see below).</p>
<p><strong>Demo:</strong> the demo without an account opens a fictitious company for 24 hours, then it is erased. Do not enter real data in it.</p>` },
      { id: 'formules', title: 'Plans and prices', html: `<p>The plans (Starter, Pro, Enterprise) and their limits are described on the pricing page. Prices are shown in the currency of the chosen country, excluding taxes, and are never converted. The Enterprise plan and countries without a published price are quoted.</p>
<p>The licence is paid in advance, for the number of months chosen, on our payment provider’s store. It extends access by that period. <strong>There is no automatic renewal:</strong> to carry on, the Customer buys a new licence.</p>
<p><strong>Before and after the end:</strong> owners and admins are warned by e-mail and by a bar in Struo before the end of the trial or licence. After the end, everything stays open during a grace period, whose length is given in these messages. Then the space turns read-only: the data can still be read and exported, but nothing new can be recorded until a licence is entered.</p>
<p>We may change our prices. A change never applies to a period already paid, and we announce it at least 30 days before.</p>` },
      { id: 'mise-en-ordre', title: 'Your company in order in 30 days', html: `<p>The Pro plan includes a start-up support:</p>
<ul>
  <li>bringing over the Customer’s sites, clients and phases from its spreadsheet;</li>
  <li>setting up roles, reports, required documents, VAT, retention and reminders;</li>
  <li>training the site leads, remotely or on site as agreed;</li>
  <li>setting up the client space;</li>
  <li>a check-in every week during the first 30 days.</li>
</ul>
<p>This timeline assumes the Customer provides its data and makes itself available for the planned check-ins. Kete commits to using all necessary means to keep to it. The results obtained depend on how the company uses it: they are not guaranteed.</p>` },
      { id: 'engagements-client', title: 'The Customer’s commitments', html: `<ul>
  <li>Keep its credentials secret and only invite the people who need it, with the right role.</li>
  <li>Only record data it has the right to process, and inform the people concerned (team, end clients, subcontractors), in particular about dated, located photos taken on the sites.</li>
  <li>Get the consent of recognisable people in photos when the law requires it.</li>
  <li>Not use Struo for an unlawful activity, try to reach another company’s data, or disrupt the service.</li>
  <li>Check amounts, invoices and documents before sending them: Struo calculates, the Customer remains responsible for what it issues.</li>
</ul>` },
      { id: 'engagements-kete', title: 'Kete’s commitments', html: `<ul>
  <li>Provide Struo with care and keep it up to date.</li>
  <li>Protect the Customer’s data as described in the <a href="/confidentialite">privacy policy</a> and the <a href="/traitement-donnees">data processing agreement</a>.</li>
  <li>Answer support by e-mail, at ${M}.</li>
</ul>
<p>Kete is bound by an obligation of means. The service may be interrupted for maintenance, a provider’s failure or force majeure. The offline mode of the field app lets reports carry on during an outage.</p>` },
      { id: 'donnees', title: 'The Customer’s data', html: `<p>The data recorded in Struo belongs to the Customer. Kete only uses it to provide the service. The Customer can export it in full, at any time, in one click.</p>
<p>For this data, Kete acts as a processor within the meaning of the GDPR. The <a href="/traitement-donnees">data processing agreement</a> is part of these terms.</p>` },
      { id: 'ia', title: 'Assistant and artificial intelligence', html: '<p>The texts, summaries and suggestions produced by the assistant are suggestions. A person of the company reads and approves them before anything is sent to a client or changed. Kete is not responsible for decisions taken on the basis of these suggestions.</p>' },
      { id: 'propriete', title: 'Intellectual property', html: '<p>Struo remains Kete’s property. The licence gives the Customer a personal, non-transferable right of use for the period paid. The Customer may not copy, resell or decompile the software.</p>' },
      { id: 'responsabilite', title: 'Liability', html: '<p>Kete is liable for direct damage caused by a proven breach of its obligations. Its total liability is limited to the amounts paid by the Customer during the 12 months before the event in question. Kete is not liable for indirect damage, such as a loss of revenue or customers. These limits do not apply in the event of gross or intentional misconduct, or where the law forbids them.</p>' },
      { id: 'fin', title: 'End of the contract', html: `<ul>
  <li><strong>By the Customer:</strong> at any time, at no cost. It is enough not to renew its licence. The period already paid is not refunded, unless the service was unavailable for a lasting period through Kete’s fault.</li>
  <li><strong>By Kete:</strong> in the event of a serious breach by the Customer (non-payment, unlawful use, attack on security), after a formal notice left unanswered for 15 days, or immediately if the service or other customers are in danger.</li>
  <li><strong>After the end:</strong> the space turns read-only after the grace period, and the Customer can still export its data. At its request, Kete deletes the space and its data, except what the law requires to keep.</li>
</ul>` },
      { id: 'modifications', title: 'Changes to the terms', html: '<p>Kete may change these terms. Any significant change is announced by e-mail at least 30 days before. If the Customer refuses it, it can stop the service before it takes effect; the remaining paid period is then refunded pro rata.</p>' },
      { id: 'droit', title: 'Applicable law and disputes', html: '<p>These terms are governed by the law of the country where Kete carries on its activity, subject to the mandatory rules of the Customer’s country. In case of disagreement, the parties first seek an amicable solution for 30 days. Failing that, the dispute is brought before the competent courts of Kete’s place of business.</p>' },
    ],
  },

  dpa: {
    slug: 'traitement-donnees',
    title: 'Data processing agreement',
    lead: 'The contract that governs how Kete processes the data your company records in Struo, under article 28 of the GDPR. It is part of the terms and applies without a separate signature.',
    summary: [],
    sections: [
      { id: 'parties', title: 'Parties and roles', html: `<p>The customer company is the <strong>controller</strong> of the data it records in Struo. Kete is its <strong>processor</strong>: it only processes this data to provide Struo, according to the Customer’s instructions given through the use of the service, its settings and its written requests.</p>
<p>If an instruction seems contrary to the law, Kete tells the Customer without delay.</p>` },
      { id: 'objet', title: 'Description of the processing', html: table(['', ''], [
        ['<strong>Subject</strong>', 'Providing the Struo software: site management, field reports, finance, documents, planning, client space, assistant and connections.'],
        ['<strong>Duration</strong>', 'The duration of the contract, then until the deletion requested by the Customer after its export.'],
        ['<strong>Operations</strong>', 'Collection, recording, storage, consultation, formatting, sending to the people chosen by the Customer, transcription and assisted writing when used, deletion.'],
        ['<strong>Data subjects</strong>', 'The Customer’s users, workers and subcontractors, end clients, suppliers’ contacts.'],
        ['<strong>Data</strong>', 'Identity and contact details, roles, photos with date, time and position, written and voice notes, signatures, attendance, documents, amounts, invoices, messages, history of actions.'],
        ['<strong>Sensitive data</strong>', 'None is requested. The Customer undertakes not to record any (health, opinions, etc.) unless the law allows it and it has taken the necessary measures.'],
      ]) },
      { id: 'obligations', title: 'Kete’s commitments', html: `<ul>
  <li><strong>Confidentiality:</strong> only the people who need it access the data, and they are bound to secrecy.</li>
  <li><strong>Security:</strong> Kete applies the measures described below and keeps them up to date.</li>
  <li><strong>Help to the Customer:</strong> Kete helps it answer people’s requests (access, rectification, erasure, portability), carry out an impact assessment if needed, and answer a supervisory authority.</li>
  <li><strong>Data breach:</strong> Kete tells the Customer without undue delay after becoming aware of it, with the information available: nature, data and people concerned, likely consequences, measures taken.</li>
  <li><strong>End of the contract:</strong> the Customer exports its data; Kete deletes it at its request, except where the law requires keeping it. The database restore history then clears itself by automatic rotation.</li>
  <li><strong>Proof:</strong> Kete provides on request the information needed to show it complies with this agreement. An audit may be carried out once a year, at the Customer’s expense, with 30 days’ notice and an auditor bound to secrecy.</li>
</ul>` },
      { id: 'sous-traitants', title: 'Sub-processors', html: `<p>The Customer authorises Kete to use the following providers. Kete imposes on them by contract data protection obligations equivalent to those of this agreement. To add or replace a provider, Kete tells the Customer by e-mail at least 30 days before. The Customer may object for a legitimate reason; if no solution is found, it can stop the service and be refunded for the unused period.</p>
${table(['Provider', 'Role', 'When'], [
        ['Neon, Inc.', 'Database and file storage, in Frankfurt (European Union)', 'Always'],
        ['Contabo GmbH (Germany)', 'Application server', 'Always'],
        ['Resend', 'Sending e-mails (invitations, reports, invoices, reminders), in the United States', 'Always'],
        ['Functional Software, Inc. (Sentry)', 'Technical error reports, without site content, hosted in the European Union', 'Always'],
        ['OpenAI', 'Voice note transcription, assisted writing, built-in assistant, in the United States', 'If the plan includes them and the company uses these features'],
        ['Chariow', 'Selling licences and payment', 'When a licence is bought'],
      ])}
<p>The Umami audience measurement is installed on Kete’s server and only covers the public site, without cookies or personal data: it does not concern the Customer’s data.</p>
<p>The assistants the Customer connects itself through MCP (Claude, ChatGPT or others) are not Kete’s processors: the Customer chooses them and answers for them.</p>` },
      { id: 'transferts', title: 'Transfers outside the European Union', html: '<p>When data is processed outside the European Union by a provider listed above, the transfer is covered by the European Commission’s standard contractual clauses, or by the EU–US Data Privacy Framework when the provider has joined it.</p>' },
      { id: 'mesures', title: 'Security measures', html: `<ul>
  <li><strong>Isolation:</strong> each company is partitioned in the database by row-level security rules; a session can only read its own company’s data.</li>
  <li><strong>Encryption:</strong> all connections use HTTPS; the database and the files are encrypted on Neon’s disks.</li>
  <li><strong>Access:</strong> rights by role in the company; passwords and access keys kept as fingerprints; revocable assistant connections; revocable client space links.</li>
  <li><strong>Files:</strong> photos and documents served only through temporary links, after checking rights.</li>
  <li><strong>Traceability:</strong> log of sensitive actions (approvals, invoices, rights, assistants’ gestures).</li>
  <li><strong>Human confirmation:</strong> any action by an assistant that commits the company requires a person’s agreement.</li>
  <li><strong>Offline:</strong> data waiting on a phone is deleted as soon as it is sent.</li>
  <li><strong>Restore:</strong> automatic database restore history, erased by rotation.</li>
  <li><strong>Development:</strong> code review, automated tests and automated secret scanning before every release.</li>
</ul>` },
    ],
  },
};
