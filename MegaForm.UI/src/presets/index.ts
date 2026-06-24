// ============================================================
// MegaForm — 50 Preset Form Templates
// Each preset defines a complete form: title, fields, settings
// ============================================================

import type { FormField } from '@core/types';

export interface FormPreset {
  title: string;
  description: string;
  submitButtonText: string;
  fields: Partial<FormField>[];
  customHtml?: string;
  customCss?: string;
}

/** Shorthand: create a field definition */
function f(type: string, key: string, label: string, o?: Partial<FormField>): Partial<FormField> {
  return { type: type as any, key, label, ...o };
}

/** Shorthand: create a required field */
function req(type: string, key: string, label: string, o?: Partial<FormField>): Partial<FormField> {
  return f(type, key, label, { required: true, ...o });
}

export const PRESETS: Record<string, FormPreset> = {
  'contact': { title: 'Contact Us', description: 'Get in touch', submitButtonText: 'Send Message', fields: [
    req('FullName','name','Your Name',{widgetProps:{showPrefix:false,showMiddle:false}}),
    req('Email','email','Email'), f('Phone','phone','Phone'),
    req('Select','subject','Subject',{options:[{label:'General',value:'general'},{label:'Support',value:'support'},{label:'Sales',value:'sales'},{label:'Other',value:'other'}]}),
    req('Textarea','message','Message',{placeholder:'How can we help?'})]},

  'registration': { title: 'Create Account', description: 'Sign up free', submitButtonText: 'Register', fields: [
    req('FullName','fullname','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Text','username','Username'),
    f('Select','role','Account Type',{options:[{value:'personal',label:'Personal'},{value:'business',label:'Business'}]}),
    req('Terms','terms','Terms',{widgetProps:{termsText:'I agree to the Terms of Service and Privacy Policy',required:true}})]},

  'login': { title: 'Sign In', description: 'Welcome back', submitButtonText: 'Login', fields: [
    req('Email','email','Email'), req('Text','password','Password')]},

  'newsletter': { title: 'Stay Updated', description: 'Subscribe to our newsletter', submitButtonText: 'Subscribe', fields: [
    req('Email','email','Email',{placeholder:'your@email.com'}), f('Text','first_name','First Name')]},

  'checkout': { title: 'Checkout', description: 'Complete your order', submitButtonText: 'Place Order', fields: [
    f('Section','s1','Billing Information'),
    req('FullName','billing_name','Full Name'), req('Email','billing_email','Email'), req('Phone','billing_phone','Phone'),
    req('Address','billing_address','Billing Address',{widgetProps:{showLine2:true,showCountry:true}}),
    f('Section','s2','Payment'),
    {type:'PaymentSummary' as any,key:'order_summary',label:'Order Summary',widgetProps:{taxRate:10,currency:'USD'}},
    {type:'Stripe' as any,key:'payment',label:'Payment',required:true,widgetProps:{currency:'USD'}}]},

  'lead-gen': { title: 'Get Started Today', description: 'We will contact you shortly', submitButtonText: 'Get Started', fields: [
    req('FullName','name','Your Name'), req('Email','email','Work Email'), req('Phone','phone','Phone'),
    f('Text','company','Company'),
    f('Select','budget','Budget',{options:[{value:'<5k',label:'Under $5,000'},{value:'5k-15k',label:'$5K–$15K'},{value:'15k-50k',label:'$15K–$50K'},{value:'>50k',label:'$50K+'}]}),
    f('Textarea','message','About your project')]},

  'demo-request': { title: 'Book a Demo', description: 'See our product in action', submitButtonText: 'Request Demo', fields: [
    req('FullName','name','Full Name'), req('Email','email','Work Email'), req('Phone','phone','Phone'),
    req('Text','company','Company'), f('Number','company_size','Company Size'),
    f('Select','interest','Interested in',{options:[{value:'starter',label:'Starter'},{value:'pro',label:'Pro'},{value:'enterprise',label:'Enterprise'}]}),
    f('Textarea','notes','Notes')]},

  'appointment': { title: 'Book an Appointment', description: 'Choose a date and time', submitButtonText: 'Book Now', fields: [
    req('FullName','name','Your Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Select','service','Service',{options:[{value:'consultation',label:'Consultation'},{value:'checkup',label:'Check-up'},{value:'followup',label:'Follow-up'}]}),
    req('Appointment' as any,'appointment','Date & Time',{widgetProps:{timeSlots:['09:00','09:30','10:00','10:30','11:00','14:00','14:30','15:00','15:30','16:00']}}),
    f('Textarea','notes','Notes')]},

  'survey': { title: 'Customer Satisfaction', description: 'Help us improve', submitButtonText: 'Submit', fields: [
    f('Text','name','Name (optional)'), f('Email','email','Email (optional)'),
    req('DynamicLabel' as any,'survey_intro','Survey intro',{widgetProps:{html:'<div class="mf-dynamic-label-note"><strong>Feedback survey</strong><br>Use the controls below to collect structured customer feedback.</div>',allowRawHtml:true,enableTokens:true}}),
    f('Textarea','feedback','Additional feedback'),
    f('Checkbox','improve','What to improve?',{options:[{value:'speed',label:'Speed'},{value:'quality',label:'Quality'},{value:'price',label:'Pricing'},{value:'support',label:'Support'}]})]},

  'event-registration': { title: 'Event Registration', description: 'Register for our event', submitButtonText: 'Register', fields: [
    req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}), req('Email','email','Email'), req('Phone','phone','Phone'),
    f('Text','company','Organization'),
    f('Select','ticket','Ticket Type',{options:[{value:'general',label:'General'},{value:'vip',label:'VIP'},{value:'virtual',label:'Virtual'}]}),
    f('Select','dietary','Dietary',{options:[{value:'none',label:'None'},{value:'vegetarian',label:'Vegetarian'},{value:'vegan',label:'Vegan'},{value:'halal',label:'Halal'}]}),
    f('Textarea','questions','Questions'),
    req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the event Terms & Conditions',required:true}})]},

  'job-application': { title: 'Job Application', description: 'Apply for this position', submitButtonText: 'Submit', fields: [
    req('FullName','name','Full Name',{widgetProps:{showPrefix:true,showMiddle:true}}), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}),
    f('Url','linkedin','LinkedIn'),
    req('File','resume','Resume',{fileSettings:{maxSizeMB:10,maxFiles:1,allowedExtensions:['.pdf','.doc','.docx']}}),
    f('File','cover','Cover Letter',{fileSettings:{maxSizeMB:5,maxFiles:1}}),
    f('Textarea','experience','Experience'),
    f('Select','availability','Availability',{options:[{value:'immediate',label:'Immediately'},{value:'2weeks',label:'2 Weeks'},{value:'1month',label:'1 Month'}]}),
    f('Text','salary','Expected Salary'),
    req('Terms','agree','Consent',{widgetProps:{termsText:'I confirm the information is accurate',required:true}})]},

  'quote-request': { title: 'Request a Quote', description: 'Free quote for your project', submitButtonText: 'Get Quote', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'), f('Text','company','Company'),
    req('Select','service','Service',{options:[{value:'web',label:'Web Dev'},{value:'design',label:'Design'},{value:'marketing',label:'Marketing'},{value:'other',label:'Other'}]}),
    f('Select','budget','Budget',{options:[{value:'<1k',label:'<$1K'},{value:'1k-5k',label:'$1K–$5K'},{value:'5k-20k',label:'$5K–$20K'},{value:'>20k',label:'$20K+'}]}),
    f('Select','timeline','Timeline',{options:[{value:'asap',label:'ASAP'},{value:'1month',label:'1 Month'},{value:'3months',label:'1–3 Months'},{value:'flexible',label:'Flexible'}]}),
    req('Textarea','details','Project Details')]},

  'donation': { title: 'Make a Donation', description: 'Your generosity matters', submitButtonText: 'Donate', fields: [
    req('FullName','name','Your Name'), req('Email','email','Email'),
    f('Select','amount','Amount',{options:[{value:'10',label:'$10'},{value:'25',label:'$25'},{value:'50',label:'$50'},{value:'100',label:'$100'},{value:'custom',label:'Custom'}]}),
    f('Number','custom_amount','Custom Amount ($)'),
    f('Select','frequency','Frequency',{options:[{value:'once',label:'One-time'},{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly'}]}),
    f('Textarea','message','Message'),
    {type:'Stripe' as any,key:'payment',label:'Payment',required:true,widgetProps:{currency:'USD'}}]},

  'order-form': { title: 'Place an Order', description: '', submitButtonText: 'Submit Order', fields: [
    req('FullName','customer','Customer'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Select','product','Product',{options:[{value:'basic',label:'Basic'},{value:'standard',label:'Standard'},{value:'premium',label:'Premium'}]}),
    req('Number','qty','Quantity',{validation:{min:1,max:100} as any}),
    req('Address','shipping','Shipping Address',{widgetProps:{showLine2:true,showCountry:true}}),
    f('Textarea','instructions','Special Instructions')]},

  'search': { title: 'Search', description: '', submitButtonText: 'Search', fields: [
    req('Text','query','',{placeholder:'Type to search...'})]},

  'product-filter': { title: 'Filter Products', description: '', submitButtonText: 'Apply', fields: [
    f('Text','keyword','Keyword'),
    f('Select','category','Category',{options:[{value:'all',label:'All'},{value:'electronics',label:'Electronics'},{value:'clothing',label:'Clothing'},{value:'home',label:'Home'}]}),
    {type:'Slider' as any,key:'price_max',label:'Max Price',widgetProps:{min:0,max:1000,step:10,unit:'$'}},
    f('Checkbox','brand','Brand',{options:[{value:'apple',label:'Apple'},{value:'samsung',label:'Samsung'},{value:'sony',label:'Sony'}]}),
    f('Select','sort','Sort',{options:[{value:'relevance',label:'Relevance'},{value:'price_low',label:'Price ↑'},{value:'price_high',label:'Price ↓'},{value:'newest',label:'Newest'}]})]},

  'forgot-password': { title: 'Reset Password', description: 'Enter your email for a reset link', submitButtonText: 'Send Link', fields: [
    req('Email','email','Email')]},

  'change-password': { title: 'Change Password', description: '', submitButtonText: 'Update', fields: [
    req('Text','current','Current Password'), req('Text','new_pw','New Password'), req('Text','confirm_pw','Confirm Password')]},

  'profile-update': { title: 'Update Profile', description: 'Keep your info current', submitButtonText: 'Save', fields: [
    req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}), req('Email','email','Email'), f('Phone','phone','Phone'),
    f('Date','birthday','Date of Birth'),
    f('Select','gender','Gender',{options:[{value:'male',label:'Male'},{value:'female',label:'Female'},{value:'other',label:'Other'},{value:'na',label:'Prefer not to say'}]}),
    f('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}), f('Url','website','Website'), f('Textarea','bio','Bio')]},

  'add-address': { title: 'Add Address', description: '', submitButtonText: 'Save', fields: [
    req('Text','label','Label',{placeholder:'Home, Office...'}), req('FullName','recipient','Recipient'), req('Phone','phone','Phone'),
    req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}})]},

  'product-review': { title: 'Write a Review', description: 'Share your experience', submitButtonText: 'Submit', fields: [
    req('Rating','rating','Overall Rating'), req('Text','title','Review Title'),
    req('Textarea','review','Your Review'), f('Text','name','Your Name'),
    f('File','photos','Photos',{fileSettings:{maxSizeMB:5,maxFiles:5,allowedExtensions:['.jpg','.png','.webp']}}),
    {type:'OpinionScale' as any,key:'recommend',label:'Would you recommend?',widgetProps:{min:1,max:5,minLabel:'No',maxLabel:'Definitely'}}]},

  'ask-question': { title: 'Ask a Question', description: 'Get expert answers', submitButtonText: 'Submit', fields: [
    req('Text','name','Name'), req('Email','email','Email'),
    f('Select','category','Category',{options:[{value:'general',label:'General'},{value:'technical',label:'Technical'},{value:'billing',label:'Billing'}]}),
    req('Text','subject','Subject'), req('Textarea','question','Your Question')]},

  'course-enrollment': { title: 'Enroll in Course', description: '', submitButtonText: 'Enroll', fields: [
    req('FullName','student','Student Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    f('Date','dob','Date of Birth'),
    f('Select','education','Education',{options:[{value:'high_school',label:'High School'},{value:'bachelor',label:"Bachelor's"},{value:'master',label:"Master's"},{value:'phd',label:'PhD'}]}),
    f('Select','course','Course',{options:[{value:'intro',label:'Introduction'},{value:'intermediate',label:'Intermediate'},{value:'advanced',label:'Advanced'}]}),
    f('Textarea','goals','Learning Goals'),
    req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the course terms and refund policy',required:true}})]},

  'download-form': { title: 'Download Resource', description: 'Get instant access', submitButtonText: 'Download', fields: [
    req('Text','first_name','First Name'), req('Email','email','Work Email'), f('Text','company','Company'),
    f('Select','role','Role',{options:[{value:'developer',label:'Developer'},{value:'designer',label:'Designer'},{value:'manager',label:'Manager'},{value:'exec',label:'Executive'}]})]},

  'cost-calculator': { title: 'Cost Calculator', description: 'Get an instant estimate', submitButtonText: 'Calculate', fields: [
    f('Select','type','Service Type',{options:[{value:'basic',label:'Basic'},{value:'standard',label:'Standard'},{value:'premium',label:'Premium'}]}),
    {type:'Slider' as any,key:'qty',label:'Quantity',widgetProps:{min:1,max:100,step:1,unit:' units'}},
    {type:'Slider' as any,key:'duration',label:'Duration',widgetProps:{min:1,max:24,step:1,unit:' months'}},
    f('Checkbox','addons','Add-ons',{options:[{value:'support',label:'Priority Support'},{value:'training',label:'Training'},{value:'custom',label:'Customization'}]}),
    req('Email','email','Email for Quote')]},

  'coupon-signup': { title: 'Get 15% Off!', description: 'Subscribe for your exclusive discount', submitButtonText: 'Get Discount', fields: [
    req('Email','email','Email'), f('Text','first_name','First Name'), f('Date','birthday','Birthday')]},

  'support-ticket': { title: 'Submit a Ticket', description: 'We reply within 24h', submitButtonText: 'Submit', fields: [
    req('FullName','name','Name'), req('Email','email','Email'),
    req('Select','priority','Priority',{options:[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'critical',label:'Critical'}]}),
    req('Select','category','Category',{options:[{value:'bug',label:'Bug'},{value:'feature',label:'Feature'},{value:'billing',label:'Billing'},{value:'account',label:'Account'},{value:'other',label:'Other'}]}),
    req('Text','subject','Subject'), req('Textarea','desc','Description'),
    f('File','attach','Attachments',{fileSettings:{maxSizeMB:10,maxFiles:3}})]},

  'affiliate-application': { title: 'Become a Partner', description: 'Join our affiliate program', submitButtonText: 'Apply', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    f('Text','company','Brand Name'), req('Url','website','Website'),
    f('Select','audience','Audience Size',{options:[{value:'<1k',label:'<1K'},{value:'1k-10k',label:'1K–10K'},{value:'10k-100k',label:'10K–100K'},{value:'>100k',label:'100K+'}]}),
    f('Checkbox','channels','Channels',{options:[{value:'blog',label:'Blog'},{value:'youtube',label:'YouTube'},{value:'instagram',label:'Instagram'},{value:'tiktok',label:'TikTok'},{value:'email',label:'Email'}]}),
    f('Textarea','pitch','Why partner?'),
    req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the Affiliate Terms',required:true}})]},

  'free-trial': { title: 'Start Free Trial', description: '14 days free, no credit card', submitButtonText: 'Start Trial', fields: [
    req('FullName','name','Full Name'), req('Email','email','Work Email'), f('Text','company','Company'),
    f('Select','plan','Plan',{options:[{value:'starter',label:'Starter'},{value:'pro',label:'Pro'},{value:'enterprise',label:'Enterprise'}]}),
    req('Terms','terms','Terms',{widgetProps:{termsText:'I agree to the Terms of Service',required:true}})]},

  'restaurant-reservation': { title: 'Reserve a Table', description: 'Book your dining experience', submitButtonText: 'Reserve', fields: [
    req('FullName','name','Name'), req('Phone','phone','Phone'), req('Email','email','Email'),
    req('Date','date','Date'), req('Time' as any,'time','Time',{widgetProps:{format:'12h',minuteStep:30}}),
    req('Number','guests','Guests',{validation:{min:1,max:20} as any}),
    f('Select','occasion','Occasion',{options:[{value:'none',label:'None'},{value:'birthday',label:'Birthday'},{value:'anniversary',label:'Anniversary'},{value:'business',label:'Business'}]}),
    f('Textarea','requests','Special Requests')]},

  'hotel-booking': { title: 'Book a Room', description: '', submitButtonText: 'Book', fields: [
    req('FullName','guest','Guest Name',{widgetProps:{showPrefix:true}}), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('DateRange' as any,'stay','Check-in / Check-out'), req('Number','guests','Guests',{validation:{min:1,max:10} as any}),
    req('Select','room','Room Type',{options:[{value:'standard',label:'Standard'},{value:'deluxe',label:'Deluxe'},{value:'suite',label:'Suite'}]}),
    f('Checkbox','extras','Extras',{options:[{value:'breakfast',label:'Breakfast'},{value:'parking',label:'Parking'},{value:'airport',label:'Airport Transfer'},{value:'spa',label:'Spa'}]}),
    f('Textarea','requests','Requests')]},

  'ticket-purchase': { title: 'Buy Tickets', description: 'Secure your spot', submitButtonText: 'Purchase', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Select','ticket','Ticket',{options:[{value:'general',label:'General – $50'},{value:'vip',label:'VIP – $150'},{value:'backstage',label:'Backstage – $300'}]}),
    req('Number','qty','Quantity',{validation:{min:1,max:10} as any}),
    {type:'Stripe' as any,key:'payment',label:'Payment',required:true,widgetProps:{currency:'USD'}}]},

  'notification-signup': { title: 'Get Notified', description: 'Be the first to know', submitButtonText: 'Notify Me', fields: [
    req('Email','email','Email'),
    f('Select','topic','About',{options:[{value:'launch',label:'Launch'},{value:'updates',label:'Updates'},{value:'deals',label:'Deals'}]})]},

  'age-verification': { title: 'Age Verification', description: 'You must be 21+ to enter', submitButtonText: 'Verify', fields: [
    req('Date','dob','Date of Birth'),
    req('Terms','confirm','',{widgetProps:{termsText:'I confirm I am 21 years of age or older',required:true}})]},

  'cookie-consent': { title: 'Cookie Preferences', description: 'Manage cookies', submitButtonText: 'Save', fields: [
    f('Checkbox','cookies','Categories',{options:[{value:'essential',label:'Essential (required)'},{value:'analytics',label:'Analytics'},{value:'marketing',label:'Marketing'},{value:'personalization',label:'Personalization'}]}),
    req('Terms','consent','',{widgetProps:{termsText:'I accept the selected cookie preferences',required:true}})]},

  'bug-report': { title: 'Report a Bug', description: 'Help us fix issues', submitButtonText: 'Submit', fields: [
    req('Text','title','Bug Title'),
    req('Select','severity','Severity',{options:[{value:'low',label:'Low – Cosmetic'},{value:'medium',label:'Medium – Functional'},{value:'high',label:'High – Blocking'},{value:'critical',label:'Critical – Crash'}]}),
    f('Text','url','Page URL'),
    f('Select','browser','Browser',{options:[{value:'chrome',label:'Chrome'},{value:'firefox',label:'Firefox'},{value:'safari',label:'Safari'},{value:'edge',label:'Edge'}]}),
    req('Textarea','steps','Steps to Reproduce'), req('Textarea','expected','Expected Behavior'), req('Textarea','actual','Actual Behavior'),
    f('File','screenshot','Screenshots',{fileSettings:{maxSizeMB:5,maxFiles:5,allowedExtensions:['.jpg','.png','.gif']}})]},

  'refer-friend': { title: 'Refer a Friend', description: 'Earn rewards', submitButtonText: 'Send Invite', fields: [
    req('Text','your_name','Your Name'), req('Email','your_email','Your Email'),
    req('Text','friend_name','Friend Name'), req('Email','friend_email','Friend Email'),
    f('Textarea','message','Message',{placeholder:'Hey! I thought you might like this...'})]},

  'free-consultation': { title: 'Free Consultation', description: 'Expert advice at no cost', submitButtonText: 'Book', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Select','topic','Topic',{options:[{value:'legal',label:'Legal'},{value:'financial',label:'Financial'},{value:'tax',label:'Tax'},{value:'business',label:'Business'}]}),
    req('Appointment' as any,'time','Preferred Time',{widgetProps:{timeSlots:['09:00','10:00','11:00','14:00','15:00','16:00']}}),
    f('Textarea','details','Brief description')]},

  'social-connect': { title: 'Connect Account', description: '', submitButtonText: 'Connect', fields: [
    req('Email','email','Email'), f('Text','display_name','Display Name'), f('Url','profile','Profile URL'),
    req('Terms','terms','',{widgetProps:{termsText:'I authorize connecting my social account',required:true}})]},

  'plan-selection': { title: 'Choose Plan', description: 'Select the best fit', submitButtonText: 'Continue', fields: [
    {type:'ImageChoice' as any,key:'plan',label:'Plan',required:true,options:[{value:'starter',label:'Starter $9/mo'},{value:'pro',label:'Pro $29/mo'},{value:'enterprise',label:'Enterprise $99/mo'}]},
    f('Select','billing','Billing',{options:[{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly (–20%)'}]}),
    req('Email','email','Email'), f('Text','coupon','Coupon Code')]},

  'file-submission': { title: 'Submit Your Work', description: 'Upload for review', submitButtonText: 'Submit', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'),
    f('Select','category','Category',{options:[{value:'essay',label:'Essay'},{value:'portfolio',label:'Portfolio'},{value:'assignment',label:'Assignment'}]}),
    f('Text','title','Title'), req('File','files','Files',{fileSettings:{maxSizeMB:25,maxFiles:5}}), f('Textarea','notes','Notes')]},

  'post-service-feedback': { title: 'How was your experience?', description: '', submitButtonText: 'Submit', fields: [
    f('Text','order_num','Order Number'),
    req('OpinionScale' as any,'overall','Overall',{widgetProps:{min:1,max:5,minLabel:'Very Dissatisfied',maxLabel:'Very Satisfied'}}),
    req('DynamicLabel' as any,'service_context','Service context',{widgetProps:{html:'<div class="mf-dynamic-label-note">Logged service context: {{query:service}} {{field:service_type}}</div>',allowRawHtml:true,enableTokens:true}}),
    f('Radio','return','Would you use us again?',{options:[{value:'yes',label:'Yes'},{value:'maybe',label:'Maybe'},{value:'no',label:'No'}]}),
    f('Textarea','comments','Comments')]},

  'data-deletion': { title: 'Data Deletion Request', description: 'Request removal of your data', submitButtonText: 'Submit', fields: [
    req('Email','email','Account Email'), req('FullName','name','Full Name'),
    f('Select','reason','Reason',{options:[{value:'no_use',label:'No longer using'},{value:'privacy',label:'Privacy'},{value:'other',label:'Other'}]}),
    req('Terms','confirm','',{widgetProps:{termsText:'I understand this is irreversible and all data will be deleted',required:true}})]},

  'catalog-request': { title: 'Request Catalog', description: 'Get our latest catalog', submitButtonText: 'Request', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), f('Phone','phone','Phone'), f('Text','company','Company'),
    req('Address','address','Mailing Address',{widgetProps:{showLine2:true,showCountry:true}}),
    f('Checkbox','interests','Interested in',{options:[{value:'furniture',label:'Furniture'},{value:'lighting',label:'Lighting'},{value:'textiles',label:'Textiles'}]})]},

  'property-viewing': { title: 'Schedule a Viewing', description: 'Visit the property', submitButtonText: 'Book', fields: [
    req('FullName','name','Full Name'), req('Email','email','Email'), req('Phone','phone','Phone'),
    req('Appointment' as any,'viewing','Preferred Time',{widgetProps:{timeSlots:['10:00','11:00','12:00','14:00','15:00','16:00','17:00']}}),
    f('Select','buyer','I am a...',{options:[{value:'first',label:'First-time Buyer'},{value:'investor',label:'Investor'},{value:'relocating',label:'Relocating'}]}),
    f('Textarea','questions','Questions')]},

  'community-join': { title: 'Join Community', description: 'Connect with others', submitButtonText: 'Join', fields: [
    req('Text','display','Display Name'), req('Email','email','Email'),
    f('Select','interest','Interest',{options:[{value:'learn',label:'Learning'},{value:'network',label:'Networking'},{value:'share',label:'Sharing'},{value:'career',label:'Career'}]}),
    f('Textarea','intro','About yourself'),
    req('Terms','rules','',{widgetProps:{termsText:'I agree to follow the Community Guidelines',required:true}})]},

  'birthday-signup': { title: 'Birthday Gift!', description: 'Get a special gift on your birthday', submitButtonText: 'Sign Up', fields: [
    req('Text','first_name','First Name'), req('Email','email','Email'), req('Date','birthday','Birthday'),
    f('Select','pref','Preference',{options:[{value:'discount',label:'Discount Code'},{value:'freebie',label:'Free Item'},{value:'surprise',label:'Surprise Me!'}]})]},

  'domain-checker': { title: 'Check Domain', description: 'Find your perfect domain', submitButtonText: 'Check', fields: [
    req('Text','domain','Domain',{placeholder:'yourdomain'}),
    f('Select','ext','Extension',{options:[{value:'.com',label:'.com'},{value:'.net',label:'.net'},{value:'.org',label:'.org'},{value:'.io',label:'.io'}]})]},

  'otp-verify': { title: 'Verify Identity', description: 'Enter the code sent to your phone', submitButtonText: 'Verify', fields: [
    req('Text','otp','Verification Code',{placeholder:'Enter 6-digit code',validation:{minLength:6,maxLength:6} as any})]},

  'multi-step': { title: 'Complete Registration', description: 'Step by step', submitButtonText: 'Complete', fields: [
    f('Section','s1','Step 1: Personal'),
    req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}), req('Email','email','Email'), req('Phone','phone','Phone'), req('Date','dob','Date of Birth'),
    f('Section','s2','Step 2: Address'),
    req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}),
    f('Select','lang','Language',{options:[{value:'en',label:'English'},{value:'vi',label:'Tiếng Việt'},{value:'ja',label:'日本語'}]}),
    f('Checkbox','interests','Interests',{options:[{value:'tech',label:'Tech'},{value:'biz',label:'Business'},{value:'design',label:'Design'}]}),
    f('Section','s3','Step 3: Finish'),
    f('File','avatar','Photo',{fileSettings:{maxSizeMB:5,maxFiles:1,allowedExtensions:['.jpg','.png']}}),
    f('Textarea','bio','About You'),
    req('Terms','terms','',{widgetProps:{termsText:'I agree to Terms, Privacy Policy and Cookie Policy',required:true}})]},
};

/** Gallery categories */
export const PRESET_CATEGORIES: Record<string, { ids: string[]; icon: string }> = {
  'Popular':        { ids: ['contact','registration','newsletter','lead-gen','survey','checkout'], icon: 'fa-fire' },
  'Business':       { ids: ['demo-request','quote-request','free-trial','affiliate-application','plan-selection','cost-calculator'], icon: 'fa-briefcase' },
  'Booking':        { ids: ['appointment','restaurant-reservation','hotel-booking','property-viewing','free-consultation','ticket-purchase'], icon: 'fa-calendar-check' },
  'E-commerce':     { ids: ['order-form','product-review','product-filter','coupon-signup','donation','catalog-request'], icon: 'fa-shopping-cart' },
  'HR & Education': { ids: ['job-application','course-enrollment','file-submission','community-join'], icon: 'fa-graduation-cap' },
  'Survey':         { ids: ['post-service-feedback','bug-report','support-ticket','ask-question'], icon: 'fa-poll' },
  'Account':        { ids: ['login','forgot-password','change-password','profile-update','add-address','otp-verify','social-connect','age-verification'], icon: 'fa-user-circle' },
  'Marketing':      { ids: ['event-registration','notification-signup','download-form','refer-friend','birthday-signup'], icon: 'fa-bullhorn' },
  'Other':          { ids: ['search','domain-checker','cookie-consent','data-deletion','multi-step'], icon: 'fa-ellipsis-h' },
};

/** Get a preset by ID */
export function getPreset(id: string): FormPreset | undefined {
  return PRESETS[id];
}

/** Get all presets */
export function getAllPresets(): Record<string, FormPreset> {
  return PRESETS;
}
