/* ============================================================
   MegaForm — 50 Preset Form Templates
   File: megaform-builder-presets.js
   Depends on: megaform-builder-core.js, megaform-builder-templates.js
   ============================================================ */
import { MegaFormBuilder } from './core';
(function() {
    'use strict';
    var B = MegaFormBuilder;
    function f(type,key,label,o){var r={type:type,key:key,label:label};if(o)for(var k in o)r[k]=o[k];return r;}
    function req(type,key,label,o){return f(type,key,label,Object.assign({required:true},o));}
    var P = {};

    /* ══════════════════════════════════════════════════════════
       🎂 TEMPLATE 1 — Birthday Party RSVP
          Cute pink/purple theme, printable invitation card
       ══════════════════════════════════════════════════════════ */
    P['birthday-invite'] = {
        title: '🎂 Birthday Party RSVP',
        description: 'Cute invitation with guest details & wishes',
        submitButtonText: '🎉 RSVP Now!',
        category: 'events',
        icon: '🎂',
        customCss: `
/* ── Birthday Party RSVP — Pink & Purple theme ── */
body { background: linear-gradient(135deg,#fdf2f8 0%,#f5f3ff 50%,#fef9c3 100%) !important; }
.mf-form-wrap {
  background: #fff;
  border-radius: 24px;
  border: 2px solid #f9a8d4;
  box-shadow: 0 8px 40px rgba(236,72,153,.15), 0 2px 8px rgba(0,0,0,.06);
  overflow: hidden;
}
.mf-form-header {
  background: linear-gradient(135deg,#ec4899,#a855f7);
  padding: 32px 24px 24px;
  text-align: center;
  position: relative;
}
.mf-form-header::before {
  content: '🎈🎈🎈';
  font-size: 28px;
  display: block;
  margin-bottom: 8px;
  letter-spacing: 8px;
}
.mf-form-title {
  color: #fff !important;
  font-size: 28px !important;
  font-weight: 800 !important;
  text-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.mf-form-description { color: #fce7f3 !important; font-size: 15px !important; }
.mf-field-wrap label { color: #9333ea !important; font-weight: 700 !important; font-size: 13px !important; }
.mf-field-wrap input, .mf-field-wrap textarea, .mf-field-wrap select {
  border: 2px solid #f9a8d4 !important;
  border-radius: 12px !important;
  padding: 10px 14px !important;
  transition: border-color .2s, box-shadow .2s !important;
}
.mf-field-wrap input:focus, .mf-field-wrap textarea:focus, .mf-field-wrap select:focus {
  border-color: #ec4899 !important;
  box-shadow: 0 0 0 3px rgba(236,72,153,.15) !important;
  outline: none !important;
}
.mf-submit-btn {
  background: linear-gradient(135deg,#ec4899,#a855f7) !important;
  border: none !important;
  border-radius: 50px !important;
  padding: 14px 40px !important;
  font-size: 16px !important;
  font-weight: 800 !important;
  letter-spacing: 0.5px !important;
  box-shadow: 0 4px 15px rgba(168,85,247,.4) !important;
  transition: transform .2s, box-shadow .2s !important;
}
.mf-submit-btn:hover { transform: translateY(-2px) !important; box-shadow: 0 6px 20px rgba(168,85,247,.5) !important; }
/* 🖨️ PRINT STYLES */
@media print {
  body { background: #fff !important; }
  .mf-form-wrap { border: 2px solid #ec4899 !important; box-shadow: none !important; }
  .mf-form-header { background: #ec4899 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mf-form-title { font-size: 22px !important; }
  .mf-submit-btn { display: none !important; }
  .mf-field-wrap input, .mf-field-wrap textarea { border: 1px solid #f9a8d4 !important; min-height: 32px; }
}`,
        fields: [
            {type:'Html', key:'header_art', label:'', properties:{html:'<div style="text-align:center;padding:16px 0 8px;"><div style="font-size:48px">🎂</div><h2 style="margin:8px 0 4px;color:#9333ea;font-size:22px;font-weight:800">You\'re Invited!</h2><p style="color:#a855f7;margin:0;font-size:14px">Please fill out your RSVP below</p></div>'}},
            req('Text','guest_name','Your Name 👤',{placeholder:'Enter your full name'}),
            req('Email','email','Email Address 📧',{placeholder:'your@email.com'}),
            req('Phone','phone','Phone Number 📱',{placeholder:'Your phone number'}),
            req('Radio','attending','Will you attend? 🎉',{options:[{value:'yes',label:'🥳 Yes, I\'ll be there!'},{value:'maybe',label:'🤔 Maybe'},{value:'no',label:'😢 Sorry, can\'t make it'}]}),
            f('Number','guests','Number of Guests 👥',{placeholder:'How many people will join?'}),
            f('Select','dietary','Dietary Preference 🍽️',{options:[{value:'none',label:'No restrictions'},{value:'vegetarian',label:'🥗 Vegetarian'},{value:'vegan',label:'🌱 Vegan'},{value:'halal',label:'✅ Halal'},{value:'gluten-free',label:'🌾 Gluten-free'}]}),
            f('Textarea','message','Birthday Message 💌',{placeholder:'Write a sweet birthday message...',rows:3}),
            f('Rating','excitement','Excitement Level 🌟',{widgetProps:{max:5}}),
        ]
    };

    /* ══════════════════════════════════════════════════════════
       🐾 TEMPLATE 2 — Pet Adoption Application
          Warm orange/teal theme, printable adoption cert
       ══════════════════════════════════════════════════════════ */
    P['pet-adoption'] = {
        title: '🐾 Pet Adoption Form',
        description: 'Help pets find loving forever homes',
        submitButtonText: '🐾 Submit Application',
        category: 'general',
        icon: '🐾',
        customCss: `
/* ── Pet Adoption — Warm Orange & Teal theme ── */
body { background: linear-gradient(135deg,#fff7ed 0%,#f0fdfa 100%) !important; }
.mf-form-wrap {
  background: #fff;
  border-radius: 20px;
  border: 2px solid #fed7aa;
  box-shadow: 0 8px 40px rgba(251,146,60,.15);
}
.mf-form-header {
  background: linear-gradient(135deg,#f97316,#14b8a6);
  padding: 28px 24px 20px;
  text-align: center;
}
.mf-form-header::before { content:'🐕 🐈 🐇'; font-size:26px; display:block; margin-bottom:8px; letter-spacing:6px; }
.mf-form-title { color:#fff !important; font-size:26px !important; font-weight:800 !important; }
.mf-form-description { color:#fef3c7 !important; }
.mf-field-wrap label { color:#ea580c !important; font-weight:700 !important; font-size:12.5px !important; text-transform: uppercase; letter-spacing: 0.5px; }
.mf-field-wrap input, .mf-field-wrap textarea, .mf-field-wrap select {
  border: 2px solid #fed7aa !important; border-radius: 10px !important;
  background: #fffbf5 !important;
}
.mf-field-wrap input:focus, .mf-field-wrap textarea:focus {
  border-color: #f97316 !important; box-shadow: 0 0 0 3px rgba(249,115,22,.12) !important; outline:none !important;
}
.mf-submit-btn {
  background: linear-gradient(135deg,#f97316,#14b8a6) !important;
  border-radius: 50px !important; border: none !important;
  font-weight: 800 !important; font-size: 15px !important;
  box-shadow: 0 4px 15px rgba(20,184,166,.35) !important;
}
@media print {
  body { background:#fff !important; }
  .mf-form-header { background: linear-gradient(135deg,#f97316,#14b8a6) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mf-submit-btn { display:none !important; }
  .mf-form-wrap::after { content:'🐾 Pet Adoption Application — ' attr(data-form-id); display:block; text-align:center; color:#94a3b8; font-size:11px; margin-top:16px; }
}`,
        fields: [
            {type:'Html',key:'intro',label:'',properties:{html:'<div style="background:linear-gradient(135deg,#fff7ed,#f0fdfa);border-radius:12px;padding:16px;margin-bottom:4px;text-align:center"><p style="margin:0;font-size:14px;color:#7c2d12">Every pet deserves a loving home. Please answer honestly — it helps us match the right pet to you! 🐾</p></div>'}},
            req('FullName','adopter_name','Your Full Name'),
            req('Email','email','Email Address'),
            req('Phone','phone','Phone Number'),
            req('Address','address','Home Address',{widgetProps:{showLine2:true,showCountry:false}}),
            req('Select','home_type','Type of Home 🏠',{options:[{value:'house',label:'🏡 House with yard'},{value:'apt_small',label:'🏢 Small apartment'},{value:'apt_large',label:'🏙️ Large apartment'},{value:'condo',label:'🏗️ Condo'}]}),
            req('Radio','pet_type','Which pet are you interested in? 🐾',{options:[{value:'dog',label:'🐕 Dog'},{value:'cat',label:'🐈 Cat'},{value:'rabbit',label:'🐇 Rabbit'},{value:'other',label:'🦜 Other'}]}),
            f('Checkbox','other_pets','Do you have other pets? 🐾',{options:[{value:'dog',label:'Dog'},{value:'cat',label:'Cat'},{value:'none',label:'No other pets'}]}),
            f('Radio','children','Children at home? 👶',{options:[{value:'no',label:'No children'},{value:'toddlers',label:'Toddlers (0-3)'},{value:'kids',label:'Kids (4-12)'},{value:'teens',label:'Teens (13+)'}]}),
            req('Textarea','why','Why do you want to adopt? 💙',{placeholder:'Tell us about yourself and why you\'d be a great pet parent...',rows:4}),
            f('Textarea','experience','Previous pet experience',{placeholder:'Have you owned pets before?',rows:2}),
            req('Terms','agreement','Adoption Agreement',{widgetProps:{termsText:'I agree to provide proper care, nutrition, vet visits, and a loving home for my adopted pet.',required:true}}),
        ]
    };

    /* ══════════════════════════════════════════════════════════
       ✈️ TEMPLATE 3 — Travel Wishlist / Dream Trip
          Sky blue/sunset gradient, printable itinerary feel
       ══════════════════════════════════════════════════════════ */
    P['travel-wishlist'] = {
        title: '✈️ Dream Trip Planner',
        description: 'Plan your perfect vacation bucket list',
        submitButtonText: '✈️ Save My Dream Trip',
        category: 'survey',
        icon: '✈️',
        customCss: `
/* ── Travel Wishlist — Sky Blue & Sunset theme ── */
body { background: linear-gradient(160deg,#e0f2fe 0%,#bae6fd 30%,#fef3c7 70%,#fed7aa 100%) !important; }
.mf-form-wrap {
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(10px);
  border-radius: 22px;
  border: 1.5px solid rgba(14,165,233,.25);
  box-shadow: 0 8px 40px rgba(14,165,233,.2), 0 2px 8px rgba(0,0,0,.05);
}
.mf-form-header {
  background: linear-gradient(135deg,#0ea5e9,#f97316);
  padding: 28px 24px;
  text-align: center;
}
.mf-form-header::before { content:'🌍 ✈️ 🌏'; font-size:26px; display:block; margin-bottom:8px; letter-spacing:6px; }
.mf-form-title { color:#fff !important; font-size:26px !important; font-weight:800 !important; }
.mf-form-description { color:#e0f2fe !important; }
.mf-field-wrap label { color:#0369a1 !important; font-weight:700 !important; }
.mf-field-wrap input, .mf-field-wrap textarea, .mf-field-wrap select {
  border: 2px solid #bae6fd !important; border-radius: 10px !important;
  background: #f0f9ff !important;
}
.mf-field-wrap input:focus, .mf-field-wrap textarea:focus {
  border-color: #0ea5e9 !important; box-shadow: 0 0 0 3px rgba(14,165,233,.15) !important; outline:none !important;
}
.mf-submit-btn {
  background: linear-gradient(135deg,#0ea5e9,#f97316) !important;
  border-radius: 50px !important; border: none !important;
  font-weight: 800 !important;
  box-shadow: 0 4px 15px rgba(14,165,233,.35) !important;
}
@media print {
  body { background:#f0f9ff !important; }
  .mf-form-header { background: linear-gradient(135deg,#0ea5e9,#f97316) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mf-submit-btn { display:none !important; }
  .mf-form-wrap { border: 2px solid #0ea5e9 !important; box-shadow:none !important; }
  .mf-form-title::after { content: ' — Travel Planner'; font-size:14px; color:#64748b; }
}`,
        fields: [
            req('Text','traveler_name','Your Name 🧳'),
            req('Email','email','Email Address'),
            req('Select','dream_destination','Top Dream Destination 🌍',{options:[{value:'japan',label:'🇯🇵 Japan'},{value:'italy',label:'🇮🇹 Italy'},{value:'maldives',label:'🏝️ Maldives'},{value:'paris',label:'🗼 Paris, France'},{value:'bali',label:'🌺 Bali, Indonesia'},{value:'peru',label:'🦙 Peru / Machu Picchu'},{value:'iceland',label:'🌋 Iceland'},{value:'other',label:'✏️ Other (specify below)'}]}),
            f('Text','custom_destination','Other destination (if above is "Other")',{placeholder:'Where do you dream of going?'}),
            req('Select','travel_style','Travel Style 🎒',{options:[{value:'adventure',label:'🧗 Adventure & Outdoors'},{value:'culture',label:'🎭 Culture & History'},{value:'relax',label:'🏖️ Beach & Relaxation'},{value:'food',label:'🍜 Food & Culinary'},{value:'luxury',label:'💎 Luxury & Spa'},{value:'backpack',label:'🎒 Budget Backpacking'}]}),
            req('Select','budget','Budget per Person 💰',{options:[{value:'budget',label:'Under $1,000'},{value:'mid',label:'$1,000 – $3,000'},{value:'comfort',label:'$3,000 – $7,000'},{value:'luxury',label:'$7,000+'}]}),
            req('Select','duration','Trip Duration 📅',{options:[{value:'weekend',label:'Weekend (2-3 days)'},{value:'week',label:'1 Week'},{value:'twoweeks',label:'2 Weeks'},{value:'month',label:'1 Month+'},{value:'open',label:'No limit — go with the flow!'}]}),
            f('Checkbox','must_do','Must-Do Activities 🎯',{options:[{value:'hiking',label:'🥾 Hiking'},{value:'local_food',label:'🍜 Eat local food'},{value:'museum',label:'🏛️ Museums'},{value:'beach',label:'🏄 Beach / Snorkeling'},{value:'shopping',label:'🛍️ Shopping'},{value:'nightlife',label:'🎵 Nightlife'},{value:'photography',label:'📸 Photography'}]}),
            f('Rating','excitement','How excited are you? 🌟',{widgetProps:{max:5}}),
            f('Textarea','notes','Anything special about this trip? ✨',{placeholder:'Share your dream details...',rows:3}),
        ]
    };

    /* ══════════════════════════════════════════════════════════
       📚 TEMPLATE 4 — Student Study Planner
          Green/mint academic theme, printable schedule
       ══════════════════════════════════════════════════════════ */
    P['study-planner'] = {
        title: '📚 Study Planner',
        description: 'Set academic goals & weekly schedule',
        submitButtonText: '📚 Save My Plan',
        category: 'hr',
        icon: '📚',
        customCss: `
/* ── Study Planner — Fresh Green & Mint academic theme ── */
body { background: linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 50%,#eff6ff 100%) !important; }
.mf-form-wrap {
  background: #fff;
  border-radius: 20px;
  border: 2px solid #86efac;
  box-shadow: 0 8px 40px rgba(16,185,129,.15);
}
.mf-form-header {
  background: linear-gradient(135deg,#10b981,#3b82f6);
  padding: 28px 24px;
  text-align: center;
}
.mf-form-header::before { content:'📖 🎓 📝'; font-size:26px; display:block; margin-bottom:8px; letter-spacing:6px; }
.mf-form-title { color:#fff !important; font-size:26px !important; font-weight:800 !important; }
.mf-form-description { color:#d1fae5 !important; }
.mf-field-wrap label { color:#059669 !important; font-weight:700 !important; font-size:12.5px !important; text-transform:uppercase; letter-spacing:.5px; }
.mf-field-wrap input, .mf-field-wrap textarea, .mf-field-wrap select {
  border: 2px solid #a7f3d0 !important; border-radius: 10px !important; background: #f0fdf4 !important;
}
.mf-field-wrap input:focus, .mf-field-wrap textarea:focus {
  border-color: #10b981 !important; box-shadow: 0 0 0 3px rgba(16,185,129,.15) !important; outline:none !important;
}
.mf-submit-btn {
  background: linear-gradient(135deg,#10b981,#3b82f6) !important;
  border-radius: 50px !important; border: none !important; font-weight:800 !important;
  box-shadow: 0 4px 15px rgba(16,185,129,.35) !important;
}
/* Printable study schedule */
@media print {
  body { background:#fff !important; }
  .mf-form-header { background: linear-gradient(135deg,#10b981,#3b82f6) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mf-form-wrap { border: 2px solid #10b981 !important; box-shadow:none !important; }
  .mf-submit-btn { display:none !important; }
  .mf-field-wrap { page-break-inside: avoid; }
  /* Add ruled lines for blank inputs */
  .mf-field-wrap input[type=text] { border-bottom: 1.5px solid #86efac !important; border-top:none !important; border-left:none !important; border-right:none !important; border-radius:0 !important; background:transparent !important; }
}`,
        fields: [
            req('Text','student_name','Student Name 🎓'),
            req('Text','subject','Subject / Course 📖',{placeholder:'e.g. Mathematics, History, Biology'}),
            req('Select','grade','Grade / Year 🏫',{options:[{value:'g6',label:'Grade 6'},{value:'g7',label:'Grade 7'},{value:'g8',label:'Grade 8'},{value:'g9',label:'Grade 9'},{value:'g10',label:'Grade 10'},{value:'g11',label:'Grade 11'},{value:'g12',label:'Grade 12'},{value:'uni1',label:'University Year 1'},{value:'uni2',label:'University Year 2'},{value:'uni3',label:'University Year 3'},{value:'uni4',label:'University Year 4+'}]}),
            req('Date','exam_date','Exam / Deadline Date 📅'),
            req('Select','current_level','Current Level 📊',{options:[{value:'beginner',label:'😅 Need lots of help'},{value:'ok',label:'🙂 Getting there'},{value:'good',label:'😊 Pretty good'},{value:'excellent',label:'🌟 Excellent'}]}),
            req('Textarea','goals','Learning Goals 🎯',{placeholder:'What do you want to achieve? (e.g. score 90+, understand calculus, finish 3 chapters)',rows:3}),
            f('Checkbox','study_days','Study Days 📆',{options:[{value:'mon',label:'Monday'},{value:'tue',label:'Tuesday'},{value:'wed',label:'Wednesday'},{value:'thu',label:'Thursday'},{value:'fri',label:'Friday'},{value:'sat',label:'Saturday'},{value:'sun',label:'Sunday'}]}),
            f('Select','daily_hours','Daily Study Hours ⏰',{options:[{value:'0.5',label:'30 minutes'},{value:'1',label:'1 hour'},{value:'2',label:'2 hours'},{value:'3',label:'3 hours'},{value:'4+',label:'4+ hours'}]}),
            f('Checkbox','resources','Study Resources 📚',{options:[{value:'textbook',label:'📗 Textbook'},{value:'videos',label:'🎥 Video tutorials'},{value:'notes',label:'📝 Class notes'},{value:'flashcards',label:'🃏 Flashcards'},{value:'study_group',label:'👥 Study group'},{value:'tutor',label:'👩‍🏫 Tutor'}]}),
            f('Textarea','challenges','Challenges / Problem areas 🤔',{placeholder:'What parts do you find difficult?',rows:2}),
            f('Rating','motivation','Motivation Level 🔥',{widgetProps:{max:5}}),
        ]
    };

    /* ══════════════════════════════════════════════════════════
       🍰 TEMPLATE 5 — Recipe Contest Submission
          Warm bakery theme (yellow/rose), printable recipe card
       ══════════════════════════════════════════════════════════ */
    P['recipe-submit'] = {
        title: '🍰 Recipe Contest',
        description: 'Submit your best recipe and win!',
        submitButtonText: '👨‍🍳 Submit My Recipe!',
        category: 'general',
        icon: '🍰',
        customCss: `
/* ── Recipe Contest — Warm Bakery theme ── */
body { background: linear-gradient(135deg,#fffbeb 0%,#fef9c3 40%,#fce7f3 100%) !important; }
.mf-form-wrap {
  background: #fffef5;
  border-radius: 22px;
  border: 2px solid #fde68a;
  box-shadow: 0 8px 40px rgba(245,158,11,.2), 0 2px 6px rgba(0,0,0,.05);
}
.mf-form-header {
  background: linear-gradient(135deg,#f59e0b,#ec4899);
  padding: 28px 24px;
  text-align: center;
}
.mf-form-header::before { content:'🥧 🍰 🎂'; font-size:28px; display:block; margin-bottom:8px; letter-spacing:8px; }
.mf-form-title { color:#fff !important; font-size:26px !important; font-weight:800 !important; text-shadow: 0 2px 6px rgba(0,0,0,.2); }
.mf-form-description { color:#fef3c7 !important; }
.mf-field-wrap label { color:#b45309 !important; font-weight:700 !important; font-size:12.5px !important; }
.mf-field-wrap input, .mf-field-wrap textarea, .mf-field-wrap select {
  border: 2px solid #fde68a !important; border-radius: 10px !important; background: #fffef0 !important;
}
.mf-field-wrap input:focus, .mf-field-wrap textarea:focus {
  border-color: #f59e0b !important; box-shadow: 0 0 0 3px rgba(245,158,11,.15) !important; outline:none !important;
}
.mf-submit-btn {
  background: linear-gradient(135deg,#f59e0b,#ec4899) !important;
  border-radius: 50px !important; border: none !important; font-weight:800 !important;
  box-shadow: 0 4px 15px rgba(245,158,11,.4) !important;
}
/* 🖨️ Printable Recipe Card */
@media print {
  body { background:#fffef5 !important; }
  .mf-form-header { background: linear-gradient(135deg,#f59e0b,#ec4899) !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mf-form-wrap { border: 2px solid #f59e0b !important; box-shadow:none !important; max-width:680px; margin:0 auto; }
  .mf-submit-btn { display:none !important; }
  /* Recipe card decorative border */
  .mf-form-wrap::before { content:''; display:block; height:8px; background:repeating-linear-gradient(90deg,#f59e0b 0,#f59e0b 12px,#ec4899 12px,#ec4899 24px); }
  .mf-field-wrap { margin-bottom: 14px !important; }
  h2 { color:#b45309 !important; }
}`,
        fields: [
            req('Text','chef_name','Your Name 👨‍🍳'),
            req('Email','email','Email Address'),
            req('Text','recipe_name','Recipe Name 🍰',{placeholder:'e.g. Grandma\'s Chocolate Lava Cake'}),
            req('Select','category','Recipe Category 🍽️',{options:[{value:'cake',label:'🎂 Cake & Pastry'},{value:'cookies',label:'🍪 Cookies & Biscuits'},{value:'bread',label:'🍞 Bread & Rolls'},{value:'savory',label:'🥘 Savory'},{value:'drinks',label:'🧋 Drinks & Smoothies'},{value:'snacks',label:'🍿 Snacks'},{value:'other',label:'Other'}]}),
            req('Select','difficulty','Difficulty Level 👩‍🍳',{options:[{value:'easy',label:'😊 Easy — anyone can make it!'},{value:'medium',label:'🙂 Medium — some experience needed'},{value:'hard',label:'😤 Hard — for serious cooks'},{value:'pro',label:'🏆 Pro chef level'}]}),
            req('Select','prep_time','Prep + Cook Time ⏱️',{options:[{value:'15',label:'Under 15 minutes'},{value:'30',label:'30 minutes'},{value:'60',label:'About 1 hour'},{value:'90',label:'1.5 – 2 hours'},{value:'half_day',label:'Half a day'},{value:'overnight',label:'Overnight'}]}),
            f('Number','servings','Servings (how many people?) 👥',{placeholder:'e.g. 8'}),
            req('Textarea','ingredients','Ingredients 🛒',{placeholder:'List each ingredient on a new line:\ne.g.\n• 2 cups flour\n• 1 cup sugar\n• 3 eggs...',rows:6}),
            req('Textarea','instructions','Step-by-Step Instructions 📝',{placeholder:'Step 1: Preheat oven to 180°C...\nStep 2: Mix dry ingredients...',rows:8}),
            f('Textarea','tips','Chef\'s Tips & Tricks 💡',{placeholder:'Any secret tips to make this dish perfect?',rows:3}),
            f('File','photo','Recipe Photo 📸',{fileSettings:{maxSizeMB:5,maxFiles:1,allowedExtensions:['.jpg','.jpeg','.png','.webp']}}),
            f('Rating','confidence','How confident are you about this recipe? ⭐',{widgetProps:{max:5}}),
        ]
    };



    P['contact']={title:'Contact Us',description:'Get in touch',submitButtonText:'Send Message',fields:[
        req('FullName','name','Your Name',{widgetProps:{showPrefix:false,showMiddle:false}}),
        req('Email','email','Email'),f('Phone','phone','Phone'),
        req('Select','subject','Subject',{options:[{value:'general',label:'General'},{value:'support',label:'Support'},{value:'sales',label:'Sales'},{value:'other',label:'Other'}]}),
        req('Textarea','message','Message',{placeholder:'How can we help?'})]};

    P['registration']={title:'Create Account',description:'Sign up free',submitButtonText:'Register',fields:[
        req('FullName','fullname','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Text','username','Username'),
        f('Select','role','Account Type',{options:[{value:'personal',label:'Personal'},{value:'business',label:'Business'}]}),
        req('Terms','terms','Terms',{widgetProps:{termsText:'I agree to the Terms of Service and Privacy Policy',required:true}})]};

    P['login']={title:'Sign In',description:'Welcome back',submitButtonText:'Login',fields:[
        req('Email','email','Email'),req('Text','password','Password')]};

    P['newsletter']={title:'Stay Updated',description:'Subscribe to our newsletter',submitButtonText:'Subscribe',fields:[
        req('Email','email','Email',{placeholder:'your@email.com'}),f('Text','first_name','First Name')]};

    P['checkout']={title:'Checkout',description:'Complete your order',submitButtonText:'Place Order',fields:[
        f('Section','s1','Billing Information'),
        req('FullName','billing_name','Full Name'),req('Email','billing_email','Email'),req('Phone','billing_phone','Phone'),
        req('Address','billing_address','Billing Address',{widgetProps:{showLine2:true,showCountry:true}}),
        f('Section','s2','Payment'),
        {type:'PaymentSummary',key:'order_summary',label:'Order Summary',widgetProps:{taxRate:10,currency:'USD'}},
        {type:'Payment',key:'payment',label:'Payment',required:true,widgetProps:{provider:'both',requiredPaid:true,currency:'USD',title:'Complete payment',description:'Pay securely by card or PayPal to finish your submission.',amountLabel:'Amount due',payLabel:'Pay by card'}}]};

    P['lead-gen']={title:'Get Started Today',description:'We will contact you shortly',submitButtonText:'Get Started',fields:[
        req('FullName','name','Your Name'),req('Email','email','Work Email'),req('Phone','phone','Phone'),
        f('Text','company','Company'),
        f('Select','budget','Budget',{options:[{value:'<5k',label:'Under $5,000'},{value:'5k-15k',label:'$5K–$15K'},{value:'15k-50k',label:'$15K–$50K'},{value:'>50k',label:'$50K+'}]}),
        f('Textarea','message','About your project')]};

    P['demo-request']={title:'Book a Demo',description:'See our product in action',submitButtonText:'Request Demo',fields:[
        req('FullName','name','Full Name'),req('Email','email','Work Email'),req('Phone','phone','Phone'),
        req('Text','company','Company'),f('Number','company_size','Company Size'),
        f('Select','interest','Interested in',{options:[{value:'starter',label:'Starter'},{value:'pro',label:'Pro'},{value:'enterprise',label:'Enterprise'}]}),
        f('Textarea','notes','Notes')]};

    P['appointment']={title:'Book an Appointment',description:'Choose a date and time',submitButtonText:'Book Now',fields:[
        req('FullName','name','Your Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Select','service','Service',{options:[{value:'consultation',label:'Consultation'},{value:'checkup',label:'Check-up'},{value:'followup',label:'Follow-up'}]}),
        req('Appointment','appointment','Date & Time',{widgetProps:{timeSlots:['09:00','09:30','10:00','10:30','11:00','14:00','14:30','15:00','15:30','16:00']}}),
        f('Textarea','notes','Notes')]};

    P['survey']={title:'Customer Satisfaction',description:'Help us improve',submitButtonText:'Submit',fields:[
        f('Text','name','Name (optional)'),f('Email','email','Email (optional)'),
        req('DynamicLabel','survey_intro','Survey intro',{widgetProps:{html:'<div class="mf-dynamic-label-note"><strong>Feedback survey</strong><br>Use the controls below to collect structured customer feedback.</div>',allowRawHtml:true,enableTokens:true}}),
        f('Textarea','feedback','Additional feedback'),
        f('Checkbox','improve','What to improve?',{options:[{value:'speed',label:'Speed'},{value:'quality',label:'Quality'},{value:'price',label:'Pricing'},{value:'support',label:'Support'}]})]};

    P['event-registration']={title:'Event Registration',description:'Register for our event',submitButtonText:'Register',fields:[
        req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}),req('Email','email','Email'),req('Phone','phone','Phone'),
        f('Text','company','Organization'),
        f('Select','ticket','Ticket Type',{options:[{value:'general',label:'General'},{value:'vip',label:'VIP'},{value:'virtual',label:'Virtual'}]}),
        f('Select','dietary','Dietary',{options:[{value:'none',label:'None'},{value:'vegetarian',label:'Vegetarian'},{value:'vegan',label:'Vegan'},{value:'halal',label:'Halal'}]}),
        f('Textarea','questions','Questions'),
        req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the event Terms & Conditions',required:true}})]};

    P['job-application']={title:'Job Application',description:'Apply for this position',submitButtonText:'Submit',fields:[
        req('FullName','name','Full Name',{widgetProps:{showPrefix:true,showMiddle:true}}),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}),
        f('Url','linkedin','LinkedIn'),
        req('File','resume','Resume',{fileSettings:{maxSizeMB:10,maxFiles:1,allowedExtensions:['.pdf','.doc','.docx']}}),
        f('File','cover','Cover Letter',{fileSettings:{maxSizeMB:5,maxFiles:1}}),
        f('Textarea','experience','Experience'),
        f('Select','availability','Availability',{options:[{value:'immediate',label:'Immediately'},{value:'2weeks',label:'2 Weeks'},{value:'1month',label:'1 Month'}]}),
        f('Text','salary','Expected Salary'),
        req('Terms','agree','Consent',{widgetProps:{termsText:'I confirm the information is accurate',required:true}})]};

    P['quote-request']={title:'Request a Quote',description:'Free quote for your project',submitButtonText:'Get Quote',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),f('Text','company','Company'),
        req('Select','service','Service',{options:[{value:'web',label:'Web Dev'},{value:'design',label:'Design'},{value:'marketing',label:'Marketing'},{value:'other',label:'Other'}]}),
        f('Select','budget','Budget',{options:[{value:'<1k',label:'<$1K'},{value:'1k-5k',label:'$1K–$5K'},{value:'5k-20k',label:'$5K–$20K'},{value:'>20k',label:'$20K+'}]}),
        f('Select','timeline','Timeline',{options:[{value:'asap',label:'ASAP'},{value:'1month',label:'1 Month'},{value:'3months',label:'1–3 Months'},{value:'flexible',label:'Flexible'}]}),
        req('Textarea','details','Project Details')]};

    P['donation']={title:'Make a Donation',description:'Your generosity matters',submitButtonText:'Donate',fields:[
        req('FullName','name','Your Name'),req('Email','email','Email'),
        f('Select','amount','Amount',{options:[{value:'10',label:'$10'},{value:'25',label:'$25'},{value:'50',label:'$50'},{value:'100',label:'$100'},{value:'custom',label:'Custom'}]}),
        f('Number','custom_amount','Custom Amount ($)'),
        f('Select','frequency','Frequency',{options:[{value:'once',label:'One-time'},{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly'}]}),
        f('Textarea','message','Message'),{type:'Payment',key:'payment',label:'Payment',required:true,widgetProps:{provider:'both',requiredPaid:true,currency:'USD',title:'Complete payment',description:'Pay securely by card or PayPal to finish your submission.',amountLabel:'Amount due',payLabel:'Pay by card'}}]};

    P['order-form']={title:'Place an Order',description:'',submitButtonText:'Submit Order',fields:[
        req('FullName','customer','Customer'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Select','product','Product',{options:[{value:'basic',label:'Basic'},{value:'standard',label:'Standard'},{value:'premium',label:'Premium'}]}),
        req('Number','qty','Quantity',{validation:{min:1,max:100}}),
        req('Address','shipping','Shipping Address',{widgetProps:{showLine2:true,showCountry:true}}),
        f('Textarea','instructions','Special Instructions')]};

    P['search']={title:'Search',description:'',submitButtonText:'Search',fields:[
        req('Text','query','',{placeholder:'Type to search...'})]};

    P['product-filter']={title:'Filter Products',description:'',submitButtonText:'Apply',fields:[
        f('Text','keyword','Keyword'),
        f('Select','category','Category',{options:[{value:'all',label:'All'},{value:'electronics',label:'Electronics'},{value:'clothing',label:'Clothing'},{value:'home',label:'Home'}]}),
        {type:'Slider',key:'price_max',label:'Max Price',widgetProps:{min:0,max:1000,step:10,unit:'$'}},
        f('Checkbox','brand','Brand',{options:[{value:'apple',label:'Apple'},{value:'samsung',label:'Samsung'},{value:'sony',label:'Sony'}]}),
        f('Select','sort','Sort',{options:[{value:'relevance',label:'Relevance'},{value:'price_low',label:'Price ↑'},{value:'price_high',label:'Price ↓'},{value:'newest',label:'Newest'}]})]};

    P['forgot-password']={title:'Reset Password',description:'Enter your email for a reset link',submitButtonText:'Send Link',fields:[
        req('Email','email','Email')]};

    P['change-password']={title:'Change Password',description:'',submitButtonText:'Update',fields:[
        req('Text','current','Current Password'),req('Text','new_pw','New Password'),req('Text','confirm_pw','Confirm Password')]};

    P['profile-update']={title:'Update Profile',description:'Keep your info current',submitButtonText:'Save',fields:[
        req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}),req('Email','email','Email'),f('Phone','phone','Phone'),
        f('Date','birthday','Date of Birth'),
        f('Select','gender','Gender',{options:[{value:'male',label:'Male'},{value:'female',label:'Female'},{value:'other',label:'Other'},{value:'na',label:'Prefer not to say'}]}),
        f('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}),f('Url','website','Website'),f('Textarea','bio','Bio')]};

    P['add-address']={title:'Add Address',description:'',submitButtonText:'Save',fields:[
        req('Text','label','Label',{placeholder:'Home, Office...'}),req('FullName','recipient','Recipient'),req('Phone','phone','Phone'),
        req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}})]};

    P['product-review']={title:'Write a Review',description:'Share your experience',submitButtonText:'Submit',fields:[
        req('Rating','rating','Overall Rating'),req('Text','title','Review Title'),
        req('Textarea','review','Your Review'),f('Text','name','Your Name'),
        f('File','photos','Photos',{fileSettings:{maxSizeMB:5,maxFiles:5,allowedExtensions:['.jpg','.png','.webp']}}),
        {type:'OpinionScale',key:'recommend',label:'Would you recommend?',widgetProps:{min:1,max:5,minLabel:'No',maxLabel:'Definitely'}}]};

    P['ask-question']={title:'Ask a Question',description:'Get expert answers',submitButtonText:'Submit',fields:[
        req('Text','name','Name'),req('Email','email','Email'),
        f('Select','category','Category',{options:[{value:'general',label:'General'},{value:'technical',label:'Technical'},{value:'billing',label:'Billing'}]}),
        req('Text','subject','Subject'),req('Textarea','question','Your Question')]};

    P['course-enrollment']={title:'Enroll in Course',description:'',submitButtonText:'Enroll',fields:[
        req('FullName','student','Student Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        f('Date','dob','Date of Birth'),
        f('Select','education','Education',{options:[{value:'high_school',label:'High School'},{value:'bachelor',label:"Bachelor's"},{value:'master',label:"Master's"},{value:'phd',label:'PhD'}]}),
        f('Select','course','Course',{options:[{value:'intro',label:'Introduction'},{value:'intermediate',label:'Intermediate'},{value:'advanced',label:'Advanced'}]}),
        f('Textarea','goals','Learning Goals'),
        req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the course terms and refund policy',required:true}})]};

    P['download-form']={title:'Download Resource',description:'Get instant access',submitButtonText:'Download',fields:[
        req('Text','first_name','First Name'),req('Email','email','Work Email'),f('Text','company','Company'),
        f('Select','role','Role',{options:[{value:'developer',label:'Developer'},{value:'designer',label:'Designer'},{value:'manager',label:'Manager'},{value:'exec',label:'Executive'}]})]};

    P['cost-calculator']={title:'Cost Calculator',description:'Get an instant estimate',submitButtonText:'Calculate',fields:[
        f('Select','type','Service Type',{options:[{value:'basic',label:'Basic'},{value:'standard',label:'Standard'},{value:'premium',label:'Premium'}]}),
        {type:'Slider',key:'qty',label:'Quantity',widgetProps:{min:1,max:100,step:1,unit:' units'}},
        {type:'Slider',key:'duration',label:'Duration',widgetProps:{min:1,max:24,step:1,unit:' months'}},
        f('Checkbox','addons','Add-ons',{options:[{value:'support',label:'Priority Support'},{value:'training',label:'Training'},{value:'custom',label:'Customization'}]}),
        req('Email','email','Email for Quote')]};

    P['coupon-signup']={title:'Get 15% Off!',description:'Subscribe for your exclusive discount',submitButtonText:'Get Discount',fields:[
        req('Email','email','Email'),f('Text','first_name','First Name'),f('Date','birthday','Birthday')]};

    P['support-ticket']={title:'Submit a Ticket',description:'We reply within 24h',submitButtonText:'Submit',fields:[
        req('FullName','name','Name'),req('Email','email','Email'),
        req('Select','priority','Priority',{options:[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'critical',label:'Critical'}]}),
        req('Select','category','Category',{options:[{value:'bug',label:'Bug'},{value:'feature',label:'Feature'},{value:'billing',label:'Billing'},{value:'account',label:'Account'},{value:'other',label:'Other'}]}),
        req('Text','subject','Subject'),req('Textarea','desc','Description'),
        f('File','attach','Attachments',{fileSettings:{maxSizeMB:10,maxFiles:3}})]};

    P['affiliate-application']={title:'Become a Partner',description:'Join our affiliate program',submitButtonText:'Apply',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        f('Text','company','Brand Name'),req('Url','website','Website'),
        f('Select','audience','Audience Size',{options:[{value:'<1k',label:'<1K'},{value:'1k-10k',label:'1K–10K'},{value:'10k-100k',label:'10K–100K'},{value:'>100k',label:'100K+'}]}),
        f('Checkbox','channels','Channels',{options:[{value:'blog',label:'Blog'},{value:'youtube',label:'YouTube'},{value:'instagram',label:'Instagram'},{value:'tiktok',label:'TikTok'},{value:'email',label:'Email'}]}),
        f('Textarea','pitch','Why partner?'),
        req('Terms','terms','Agreement',{widgetProps:{termsText:'I agree to the Affiliate Terms',required:true}})]};

    P['free-trial']={title:'Start Free Trial',description:'14 days free, no credit card',submitButtonText:'Start Trial',fields:[
        req('FullName','name','Full Name'),req('Email','email','Work Email'),f('Text','company','Company'),
        f('Select','plan','Plan',{options:[{value:'starter',label:'Starter'},{value:'pro',label:'Pro'},{value:'enterprise',label:'Enterprise'}]}),
        req('Terms','terms','Terms',{widgetProps:{termsText:'I agree to the Terms of Service',required:true}})]};

    P['restaurant-reservation']={title:'Reserve a Table',description:'Book your dining experience',submitButtonText:'Reserve',fields:[
        req('FullName','name','Name'),req('Phone','phone','Phone'),req('Email','email','Email'),
        req('Date','date','Date'),req('Time','time','Time',{widgetProps:{format:'12h',minuteStep:30}}),
        req('Number','guests','Guests',{validation:{min:1,max:20}}),
        f('Select','occasion','Occasion',{options:[{value:'none',label:'None'},{value:'birthday',label:'Birthday'},{value:'anniversary',label:'Anniversary'},{value:'business',label:'Business'}]}),
        f('Textarea','requests','Special Requests')]};

    P['hotel-booking']={title:'Book a Room',description:'',submitButtonText:'Book',fields:[
        req('FullName','guest','Guest Name',{widgetProps:{showPrefix:true}}),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('DateRange','stay','Check-in / Check-out'),req('Number','guests','Guests',{validation:{min:1,max:10}}),
        req('Select','room','Room Type',{options:[{value:'standard',label:'Standard'},{value:'deluxe',label:'Deluxe'},{value:'suite',label:'Suite'}]}),
        f('Checkbox','extras','Extras',{options:[{value:'breakfast',label:'Breakfast'},{value:'parking',label:'Parking'},{value:'airport',label:'Airport Transfer'},{value:'spa',label:'Spa'}]}),
        f('Textarea','requests','Requests')]};

    P['ticket-purchase']={title:'Buy Tickets',description:'Secure your spot',submitButtonText:'Purchase',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Select','ticket','Ticket',{options:[{value:'general',label:'General – $50'},{value:'vip',label:'VIP – $150'},{value:'backstage',label:'Backstage – $300'}]}),
        req('Number','qty','Quantity',{validation:{min:1,max:10}}),
        {type:'Payment',key:'payment',label:'Payment',required:true,widgetProps:{provider:'both',requiredPaid:true,currency:'USD',title:'Complete payment',description:'Pay securely by card or PayPal to finish your submission.',amountLabel:'Amount due',payLabel:'Pay by card'}}]};

    P['notification-signup']={title:'Get Notified',description:'Be the first to know',submitButtonText:'Notify Me',fields:[
        req('Email','email','Email'),
        f('Select','topic','About',{options:[{value:'launch',label:'Launch'},{value:'updates',label:'Updates'},{value:'deals',label:'Deals'}]})]};

    P['age-verification']={title:'Age Verification',description:'You must be 21+ to enter',submitButtonText:'Verify',fields:[
        req('Date','dob','Date of Birth'),
        req('Terms','confirm','',{widgetProps:{termsText:'I confirm I am 21 years of age or older',required:true}})]};

    P['cookie-consent']={title:'Cookie Preferences',description:'Manage cookies',submitButtonText:'Save',fields:[
        f('Checkbox','cookies','Categories',{options:[{value:'essential',label:'Essential (required)'},{value:'analytics',label:'Analytics'},{value:'marketing',label:'Marketing'},{value:'personalization',label:'Personalization'}]}),
        req('Terms','consent','',{widgetProps:{termsText:'I accept the selected cookie preferences',required:true}})]};

    P['bug-report']={title:'Report a Bug',description:'Help us fix issues',submitButtonText:'Submit',fields:[
        req('Text','title','Bug Title'),
        req('Select','severity','Severity',{options:[{value:'low',label:'Low – Cosmetic'},{value:'medium',label:'Medium – Functional'},{value:'high',label:'High – Blocking'},{value:'critical',label:'Critical – Crash'}]}),
        f('Text','url','Page URL'),
        f('Select','browser','Browser',{options:[{value:'chrome',label:'Chrome'},{value:'firefox',label:'Firefox'},{value:'safari',label:'Safari'},{value:'edge',label:'Edge'}]}),
        req('Textarea','steps','Steps to Reproduce'),req('Textarea','expected','Expected Behavior'),req('Textarea','actual','Actual Behavior'),
        f('File','screenshot','Screenshots',{fileSettings:{maxSizeMB:5,maxFiles:5,allowedExtensions:['.jpg','.png','.gif']}})]};

    P['refer-friend']={title:'Refer a Friend',description:'Earn rewards',submitButtonText:'Send Invite',fields:[
        req('Text','your_name','Your Name'),req('Email','your_email','Your Email'),
        req('Text','friend_name','Friend Name'),req('Email','friend_email','Friend Email'),
        f('Textarea','message','Message',{placeholder:'Hey! I thought you might like this...'})]};

    P['free-consultation']={title:'Free Consultation',description:'Expert advice at no cost',submitButtonText:'Book',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Select','topic','Topic',{options:[{value:'legal',label:'Legal'},{value:'financial',label:'Financial'},{value:'tax',label:'Tax'},{value:'business',label:'Business'}]}),
        req('Appointment','time','Preferred Time',{widgetProps:{timeSlots:['09:00','10:00','11:00','14:00','15:00','16:00']}}),
        f('Textarea','details','Brief description')]};

    P['social-connect']={title:'Connect Account',description:'',submitButtonText:'Connect',fields:[
        req('Email','email','Email'),f('Text','display_name','Display Name'),f('Url','profile','Profile URL'),
        req('Terms','terms','',{widgetProps:{termsText:'I authorize connecting my social account',required:true}})]};

    P['plan-selection']={title:'Choose Plan',description:'Select the best fit',submitButtonText:'Continue',fields:[
        {type:'ImageChoice',key:'plan',label:'Plan',required:true,options:[{value:'starter',label:'Starter $9/mo'},{value:'pro',label:'Pro $29/mo'},{value:'enterprise',label:'Enterprise $99/mo'}]},
        f('Select','billing','Billing',{options:[{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly (–20%)'}]}),
        req('Email','email','Email'),f('Text','coupon','Coupon Code')]};

    P['file-submission']={title:'Submit Your Work',description:'Upload for review',submitButtonText:'Submit',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),
        f('Select','category','Category',{options:[{value:'essay',label:'Essay'},{value:'portfolio',label:'Portfolio'},{value:'assignment',label:'Assignment'}]}),
        f('Text','title','Title'),req('File','files','Files',{fileSettings:{maxSizeMB:25,maxFiles:5}}),f('Textarea','notes','Notes')]};

    P['post-service-feedback']={title:'How was your experience?',description:'',submitButtonText:'Submit',fields:[
        f('Text','order_num','Order Number'),
        req('OpinionScale','overall','Overall',{widgetProps:{min:1,max:5,minLabel:'Very Dissatisfied',maxLabel:'Very Satisfied'}}),
        req('DynamicLabel','service_context','Service context',{widgetProps:{html:'<div class="mf-dynamic-label-note">Logged service context: {{query:service}} {{field:service_type}}</div>',allowRawHtml:true,enableTokens:true}}),
        f('Radio','return','Would you use us again?',{options:[{value:'yes',label:'Yes'},{value:'maybe',label:'Maybe'},{value:'no',label:'No'}]}),
        f('Textarea','comments','Comments')]};

    P['data-deletion']={title:'Data Deletion Request',description:'Request removal of your data',submitButtonText:'Submit',fields:[
        req('Email','email','Account Email'),req('FullName','name','Full Name'),
        f('Select','reason','Reason',{options:[{value:'no_use',label:'No longer using'},{value:'privacy',label:'Privacy'},{value:'other',label:'Other'}]}),
        req('Terms','confirm','',{widgetProps:{termsText:'I understand this is irreversible and all data will be deleted',required:true}})]};

    P['catalog-request']={title:'Request Catalog',description:'Get our latest catalog',submitButtonText:'Request',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),f('Phone','phone','Phone'),f('Text','company','Company'),
        req('Address','address','Mailing Address',{widgetProps:{showLine2:true,showCountry:true}}),
        f('Checkbox','interests','Interested in',{options:[{value:'furniture',label:'Furniture'},{value:'lighting',label:'Lighting'},{value:'textiles',label:'Textiles'}]})]};

    P['property-viewing']={title:'Schedule a Viewing',description:'Visit the property',submitButtonText:'Book',fields:[
        req('FullName','name','Full Name'),req('Email','email','Email'),req('Phone','phone','Phone'),
        req('Appointment','viewing','Preferred Time',{widgetProps:{timeSlots:['10:00','11:00','12:00','14:00','15:00','16:00','17:00']}}),
        f('Select','buyer','I am a...',{options:[{value:'first',label:'First-time Buyer'},{value:'investor',label:'Investor'},{value:'relocating',label:'Relocating'}]}),
        f('Textarea','questions','Questions')]};

    P['community-join']={title:'Join Community',description:'Connect with others',submitButtonText:'Join',fields:[
        req('Text','display','Display Name'),req('Email','email','Email'),
        f('Select','interest','Interest',{options:[{value:'learn',label:'Learning'},{value:'network',label:'Networking'},{value:'share',label:'Sharing'},{value:'career',label:'Career'}]}),
        f('Textarea','intro','About yourself'),
        req('Terms','rules','',{widgetProps:{termsText:'I agree to follow the Community Guidelines',required:true}})]};

    P['birthday-signup']={title:'Birthday Gift!',description:'Get a special gift on your birthday',submitButtonText:'Sign Up',fields:[
        req('Text','first_name','First Name'),req('Email','email','Email'),req('Date','birthday','Birthday'),
        f('Select','pref','Preference',{options:[{value:'discount',label:'Discount Code'},{value:'freebie',label:'Free Item'},{value:'surprise',label:'Surprise Me!'}]})]};

    P['domain-checker']={title:'Check Domain',description:'Find your perfect domain',submitButtonText:'Check',fields:[
        req('Text','domain','Domain',{placeholder:'yourdomain'}),
        f('Select','ext','Extension',{options:[{value:'.com',label:'.com'},{value:'.net',label:'.net'},{value:'.org',label:'.org'},{value:'.io',label:'.io'}]})]};

    P['otp-verify']={title:'Verify Identity',description:'Enter the code sent to your phone',submitButtonText:'Verify',fields:[
        req('Text','otp','Verification Code',{placeholder:'Enter 6-digit code',validation:{minLength:6,maxLength:6}})]};

    P['multi-step']={title:'Complete Registration',description:'Step by step',submitButtonText:'Complete',fields:[
        f('Section','s1','Step 1: Personal'),
        req('FullName','name','Full Name',{widgetProps:{showPrefix:true}}),req('Email','email','Email'),req('Phone','phone','Phone'),req('Date','dob','Date of Birth'),
        f('Section','s2','Step 2: Address'),
        req('Address','address','Address',{widgetProps:{showLine2:true,showCountry:true}}),
        f('Select','lang','Language',{options:[{value:'en',label:'English'},{value:'vi',label:'Tiếng Việt'},{value:'ja',label:'日本語'}]}),
        f('Checkbox','interests','Interests',{options:[{value:'tech',label:'Tech'},{value:'biz',label:'Business'},{value:'design',label:'Design'}]}),
        f('Section','s3','Step 3: Finish'),
        f('File','avatar','Photo',{fileSettings:{maxSizeMB:5,maxFiles:1,allowedExtensions:['.jpg','.png']}}),
        f('Textarea','bio','About You'),
        req('Terms','terms','',{widgetProps:{termsText:'I agree to Terms, Privacy Policy and Cookie Policy',required:true}})]};

    /* ==========================================================
       GALLERY CATEGORIES & RENDER
       ========================================================== */
    var CATS = {
        'Popular':['contact','registration','newsletter','lead-gen','survey','checkout'],
        'Business':['demo-request','quote-request','free-trial','affiliate-application','plan-selection','cost-calculator'],
        'Booking':['appointment','restaurant-reservation','hotel-booking','property-viewing','free-consultation','ticket-purchase'],
        'E-commerce':['order-form','product-review','product-filter','coupon-signup','donation','catalog-request'],
        'HR & Education':['job-application','course-enrollment','file-submission','community-join'],
        'Survey':['post-service-feedback','bug-report','support-ticket','ask-question'],
        'Account':['login','forgot-password','change-password','profile-update','add-address','otp-verify','social-connect','age-verification'],
        'Marketing':['event-registration','notification-signup','download-form','refer-friend','birthday-signup'],
        'Other':['search','domain-checker','cookie-consent','data-deletion','multi-step']
    };

    var ICONS = {
        'Popular':'fa-fire','Business':'fa-briefcase','Booking':'fa-calendar-check',
        'E-commerce':'fa-shopping-cart','HR & Education':'fa-graduation-cap','Survey':'fa-poll',
        'Account':'fa-user-circle','Marketing':'fa-bullhorn','Other':'fa-ellipsis-h'
    };

    // Merge into existing presets — deferred to runtime
    function getAllPresets() {
        if (B.modules && B.modules.templates && B.modules.templates.getAllPresets) {
            return B.modules.templates.getAllPresets() || {};
        }
        return {};
    }

    // Render gallery with categories — into a separate container inside the builder
    function renderPresetGallery() {
        // NEVER overwrite #mf-template-gallery — that's the initial template chooser
        // Preset gallery renders inside the builder when user wants to switch templates
        var container = document.getElementById('mf-preset-gallery');
        if (!container) {
            // Create preset gallery container inside builder if it doesn't exist
            var builderApp = document.getElementById('mf-builder-app');
            if (!builderApp) return;
            container = document.createElement('div');
            container.id = 'mf-preset-gallery';
            container.style.display = 'none';
            builderApp.appendChild(container);
        }

        var allPresets = getAllPresets();
        var html = '';

        for (var cat in CATS) {
            var ids = CATS[cat];
            html += '<div class="mf-tplcat"><h6 class="mf-tplcat-h"><i class="fa '+(ICONS[cat]||'fa-folder')+'"></i> '+cat+'</h6><div class="mf-tpl-grid">';
            ids.forEach(function(id) {
                var tpl = allPresets[id];
                if (!tpl) return;
                var fc = tpl.fields ? tpl.fields.filter(function(f){return f.type!=='Section'&&f.type!=='Html';}).length : 0;
                html += '<div class="mf-tpl-card" data-tpl="'+id+'">';
                html += '<div class="mf-tpl-title">'+tpl.title+'</div>';
                html += '<div class="mf-tpl-meta">'+fc+' fields</div>';
                html += '</div>';
            });
            html += '</div></div>';
        }

        container.innerHTML = html;

        // Bind clicks
        container.querySelectorAll('.mf-tpl-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var tplId = this.dataset.tpl;
                if (B.state.schema.fields.length > 0) {
                    if (!confirm('This will replace all current fields. Continue?')) return;
                }
                B.applyTemplate(tplId);
            });
        });
    }

    // Hook into page load — re-render gallery after init
    B.registerModule('presets', {
        init: function() {
            // Override applyTemplate to search presets from both sources
            var origApply = B.applyTemplate;
            B.applyTemplate = function(templateId) {
                // Check if our presets have it
                if (P[templateId]) {
                    var tpl = P[templateId];
                    B.setVal(B.EL.canvasTitle, tpl.title);
                    B.setVal(B.EL.canvasDescription, tpl.description);
                    B.setVal(B.EL.submitBtnText, tpl.submitButtonText);
                    B.state.schema.fields = [];
                    tpl.fields.forEach(function(f) {
                        B.state.schema.fields.push(B.createFieldFromTemplate(f));
                    });
                    B.state.fieldCounter = B.state.schema.fields.length;
                    B.state.selectedFieldIndex = -1;
                    B.state.isDirty = true;
                    if (!B.state.schema.settings) B.state.schema.settings = {};
                    B.state.schema.settings.customHtml = tpl.customHtml || '';
                    B.state.schema.settings.customCss = tpl.customCss || '';
                    var he = document.getElementById('mf-custom-html-editor');
                    var ce = document.getElementById('mf-custom-css-editor');
                    if (he) he.value = tpl.customHtml || '';
                    if (ce) ce.value = tpl.customCss || '';
                    B.callModule('canvas', 'render');
                    B.callModule('properties', 'hideProps');
                    // Show SQL setup modal if preset carries setupSql (badge: TplSetupSql v20260429-01)
                    try {
                        if (tpl.setupSql && typeof (B as any).showSqlSetupModal === 'function') {
                            (B as any).showSqlSetupModal(String(tpl.setupSql), tpl.title || 'Template');
                        }
                    } catch (_eSql) {}
                } else if (origApply) {
                    origApply(templateId);
                }
            };
            // Preset gallery is available on-demand, not auto-rendered
            // renderPresetGallery() is called when user needs to browse presets
        },
        getAllPresets: function() { return getAllPresets(); },
        renderGallery: renderPresetGallery
    });

})();

export {};
