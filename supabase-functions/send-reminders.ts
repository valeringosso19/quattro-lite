// ============================================================
// send-reminders — Supabase Edge Function (İSKELET)
// ============================================================
// NE İŞE YARAR:
// Her gün otomatik çalışıp yenilenecek poliçeleri, gecikmiş
// taksitleri ve doğum günlerini bulur, WhatsApp Business API
// üzerinden GERÇEK OTOMATİK mesaj gönderir (tık gerekmez).
//
// GEREKSİNİM (bu olmadan çalışmaz):
// wa.me linkleri sadece manuel tıklamayla açılır — WhatsApp
// bunu kasıtlı böyle sınırlamış. Kendiliğinden/otomatik mesaj
// atabilmek için resmi bir "WhatsApp Business API" hesabına
// ihtiyacın var. İki pratik seçenek:
//
//   A) Meta WhatsApp Cloud API (resmi, ücretsiz kotası var)
//      -> business.facebook.com üzerinden başvuru + numara
//         doğrulama + mesaj şablonu onayı (birkaç gün sürebilir)
//   B) Twilio / 360dialog / Gupshup gibi üçüncü parti sağlayıcı
//      -> Kurulumu daha hızlı ama aylık ücretli
//
// Şablon mesajların Meta tarafından ÖNCEDEN ONAYLANMASI gerekiyor
// (serbest metin gönderemezsin, "poliçe_yenileme_hatirlatma" gibi
// önceden tanımlı bir şablon kullanman lazım).
//
// KURULUM (API hesabın olduğunda):
// 1. Supabase Dashboard > Edge Functions > New Function > "send-reminders"
// 2. Bu dosyanın içeriğini yapıştır, aşağıdaki WHATSAPP_* değerlerini
//    Supabase > Project Settings > Edge Functions > Secrets kısmından
//    ortam değişkeni olarak tanımla (koda gömme).
// 3. Supabase > Database > Extensions > pg_cron'u aç, sonra
//    SQL Editor'de şunu çalıştır (her gün 09:00'da tetikler):
//
//    select cron.schedule(
//      'daily-wa-reminders',
//      '0 9 * * *',
//      $$ select net.http_post(
//           url:='https://<PROJE-REF>.supabase.co/functions/v1/send-reminders',
//           headers:='{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
//         ) $$
//    );
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_API_TOKEN');       // provider'dan alınır
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID');     // Meta Cloud API numara ID'si

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Meta WhatsApp Cloud API üzerinden onaylı şablonla mesaj gönderir.
// Şablon adını ve parametrelerini kendi onaylanan şablonuna göre düzenle.
async function sendWhatsAppTemplate(phone, templateName, params) {
  const cleanPhone = phone.replace(/\D/g, '');
  const withCountry = cleanPhone.startsWith('90') ? cleanPhone : '90' + cleanPhone.replace(/^0/, '');

  const res = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: withCountry,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'tr' },
        components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
      }
    })
  });
  return res.json();
}

Deno.serve(async () => {
  const today = new Date(); today.setHours(0,0,0,0);
  const results = [];

  // --- Yenilenecek poliçeler (30 gün içinde) ---
  const { data: policies } = await sb.from('policies').select('*, customers(full_name, phone)').eq('status', 'aktif');
  for (const p of policies || []) {
    const remaining = Math.round((new Date(p.end_date) - today) / 86400000);
    if (remaining >= 0 && remaining <= 30 && p.customers?.phone) {
      const r = await sendWhatsAppTemplate(p.customers.phone, 'police_yenileme_hatirlatma', [
        p.customers.full_name, p.branch || '', String(remaining)
      ]);
      results.push({ type: 'renewal', policy: p.id, result: r });
    }
  }

  // --- Gecikmiş taksitler ---
  const { data: installments } = await sb.from('installments').select('*, customers(full_name, phone)').eq('paid', false);
  for (const i of installments || []) {
    const overdue = Math.round((today - new Date(i.due_date)) / 86400000);
    if (overdue > 0 && i.customers?.phone) {
      const r = await sendWhatsAppTemplate(i.customers.phone, 'taksit_gecikme_hatirlatma', [
        i.customers.full_name, String(i.amount)
      ]);
      results.push({ type: 'installment', installment: i.id, result: r });
    }
  }

  // --- Doğum günleri (bugün) ---
  const { data: customers } = await sb.from('customers').select('*').not('birth_date', 'is', null);
  for (const c of customers || []) {
    const b = new Date(c.birth_date);
    if (b.getMonth() === today.getMonth() && b.getDate() === today.getDate()) {
      const r = await sendWhatsAppTemplate(c.phone, 'dogum_gunu_kutlama', [c.full_name]);
      results.push({ type: 'birthday', customer: c.id, result: r });
    }
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
