# Quattro Lite — Poliçe & Cari Takip Paneli

Sade, tek amaçlı bir web paneli: **Müşteri → Poliçe → Cari Hesap → Taksit**, artı **WhatsApp hatırlatma**.
localStorage değil, Supabase (gerçek veritabanı) kullanır — bu yüzden Berra panelin gibi bir domaine kurulabilir ve ekip aynı veriyi görür.

---

## 1. Supabase Kurulumu (5 dk)

1. [supabase.com](https://supabase.com) → yeni proje oluştur (Berra için kullandığınla aynı hesap olabilir, ayrı proje aç).
2. Sol menü **SQL Editor** → **New Query** → bu klasördeki `schema.sql` dosyasının tamamını yapıştır → **Run**.
   Bu, 4 tabloyu (customers, policies, cari_transactions, installments) ve güvenlik kurallarını (RLS) kurar.
3. Sol menü **Authentication → Users → Add User** ile ekip üyelerini (kendin + varsa diğer temsilciler) e-posta/şifre ile ekle. Bu panel şu an tek katmanlı yetkilendirme kullanıyor: giriş yapan herkes tüm veriyi görüp düzenleyebiliyor (Berra'daki gibi rol bazlı ayrım yok — istersen sonra ekleriz).
4. **Project Settings → API** sayfasından `Project URL` ve `anon public` key'i kopyala.

## 2. Bağlantı Bilgilerini Gir

`config.js` dosyasını aç, iki satırı kendi bilgilerinle değiştir:

```js
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

> `anon` key herkese açık (frontend'e gömülecek) bir anahtar, sorun değil — asıl güvenlik RLS kurallarında (sadece login olan görebiliyor).

## 3. Vercel'e Deploy (Berra ile aynı akış)

```bash
npm i -g vercel   # yoksa kur
cd quattro-lite
vercel --prod
```

Ya da Vercel dashboard'dan bu klasörü GitHub'a push edip "Import Project" ile bağlayabilirsin — statik dosyalar (HTML/CSS/JS) olduğu için build ayarı gerekmiyor, "Other/Static" olarak seçmen yeterli.

## 4. Domaine Bağlama

Berra'da yaptığın gibi:
1. Vercel proje ayarları → **Domains** → domainini (örn. `takip.quattrosigorta.com` ya da elindeki bir alan adı) ekle.
2. Alastyr / domain sağlayıcında **CNAME** kaydı Vercel'in verdiği adrese yönlendir (Berra'da DNS + SSL için yaptığın adımların birebir aynısı — Vercel SSL'i otomatik veriyor, aktifleşmesi birkaç dakika-birkaç saat sürebilir).
3. Yeni bir domain almana gerek yok istersen — mevcut `.com.tr` domaininde bir subdomain (`quattro.berraotohasar.com.tr` gibi) de açabilirsin, sadece ayrı bir CNAME kaydı yeter.

---

## Ne Var, Ne Yok (bilinçli sadeleştirme)

**Var:** Poliçe oluştururken otomatik müşteri kaydı (ayrı müşteri ekleme akışı kaldırıldı — yeni müşteriler sadece poliçe formundan doğuyor), 33 sigorta şirketinden dropdown seçim (TSB üyeleri, "Diğer" seçeneğiyle serbest giriş de mümkün), doğum tarihi alanı ve yaklaşan doğum günleri için WhatsApp hatırlatma, Cari borç-alacak, Taksit takibi + ödendi işaretleme, tek-tık WhatsApp hatırlatma (yenileme + gecikmiş taksit + doğum günü), dashboard özet kartları, 4 tema, demo modu.

**Yok (SYS Pro paketindeki ama burada bilerek çıkardığım):** Aday müşteri/lead hunisi, teklif modülü, zeyilname, KYC evrak kasası, çapraz satış motoru, kampanya/toplu mesaj, görev takibi, aktivite logları, sürükle-bırak dashboard, Excel içe/dışa aktarma sihirbazı.

## Otomatik WhatsApp Gönderimi — Önemli Not

Panelin içindeki WhatsApp butonları (`wa.me` linkleri) **her zaman manuel bir tık** gerektirir — WhatsApp bunu bilerek böyle sınırlamış, tarayıcıdan kendiliğinden mesaj göndermek mümkün değil.

Gerçek anlamda "kendi kendine, tıksız gönderen" bir sistem istiyorsan bunun için resmi bir **WhatsApp Business API** hesabı gerekiyor (Meta Cloud API ya da Twilio/360dialog gibi bir sağlayıcı) + Meta'nın önceden onayladığı mesaj şablonları. `supabase-functions/send-reminders.ts` dosyasında bunun iskeletini hazırladım:

- Her gün otomatik çalışıp yenilenecek poliçeleri, gecikmiş taksitleri ve doğum günlerini tarıyor
- Supabase'in `pg_cron` özelliğiyle günlük tetikleniyor (saat ayarlanabilir)
- Gerçek gönderim için tek yapman gereken: bir WhatsApp Business API hesabı açmak, mesaj şablonlarını Meta'ya onaylatmak, ve dosyanın başındaki adımları izleyerek API anahtarlarını Supabase'e secret olarak eklemek

Bu API hesabı olmadan otomatik gönderim çalışmaz — panel şu an için hazır (tıklamalı) hatırlatma moduyla geliyor, istersen API hesabını açtığında birlikte devreye alırız.

## Yerelde Test

Sadece bir dosyayı tarayıcıda açmak yetmez (module/CORS kısıtları), basit bir sunucu ile aç:

```bash
cd quattro-lite
python3 -m http.server 8000
# tarayıcıda http://localhost:8000
```
