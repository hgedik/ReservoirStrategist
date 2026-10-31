# Değişiklikler

## 1.1 — 2026-10-31

- Mevcut HTML uygulamasının JavaScript kodu dokuz yerel dosyaya ayrıldı.
- GitHub Pages kök adresi için `index.html` ve statik yayın için `.nojekyll` eklendi.
- Eski HTML adı ikinci giriş noktası olarak korundu.
- Sıralı `defer` yükleme ve göreli yollar kullanıldı; çalışma zamanı bağımlılığı eklenmedi.
- Tek dosya etiketi güncellendi; mevcut oyun hesapları ve kayıt anahtarı korundu.
- Altı otomatik regresyon testi eklendi; yedi ekran gerçek tarayıcıda açıldı ve JavaScript hata kaydı görülmedi.

## 2.0 — 2026-10-31

- Rol, takım ve faz hedefi kilitleri bütün planlama yollarında korundu; olanaksız ayarlar atomik olarak reddedilir.
- Varsayılan bağımsız Killer ve Holder kısıtları doğrulandı; uygunluk, rol tercihi, takım lideri, notlar ve yedek değişimi eklendi.
- Beş hedef odaklı strateji, düzenlenebilir ağırlık/öncelik/rakip güç varsayımları ve açıklanabilir atamalar eklendi.
- Otomatik rakip kontrol varsayımı kaldırıldı; karşılaştırmaya süre, güç ve fırsat maliyeti ayrıntıları eklendi.
- Faz geçişi, güvenli Holder devri, takviye ve geri çekilme talimatları takım kartlarına ve emir çıktısına eklendi.
- Sürekli zaman aralıkları, tek FTC, kesirli dakikalar ve ayrı zamanlı tank hesabı uygulandı.
- XLSX/CSV doğrulaması, Contacted/ikinci Mission okuma, içe aktarma önizlemesi ve bozuk veri koruması eklendi.
- JSON şeması v2'ye taşındı; eski kayıt anahtarı ve v1 geçişi korundu.
- Manuel Battle Control, garnizon riski ve fırsat maliyetli Central projeksiyonu eklendi.
- Dar ekran, erişilebilir gezinme etiketleri ve yazdırma stilleri iyileştirildi.
- 31 Node testi ve gerçek Excel fixture'ıyla beş tarayıcı testi geçti.

## 2.1 — 2026-10-31

- Koyu arduvaz yüzeyler, yeşil vurgu ve yerel SVG simgelerle arayüz yenilendi; harici font veya görsel bağımlılığı eklenmedi.
- Komuta merkezine ayarlardan güncellenen faz/tank takvimi, yeni KPI kartları, görev tablosu ve kuvvet dağılımı düzeni eklendi.
- Takım kartlarında hedefler öne alındı; Holder/Support rolleri, güç ve lider bilgisi sadeleştirildi.
- Kritik plan hataları açık tutulurken katılım ve taktik notları açılır ayrıntılarda toplandı.
- Mobilde yatay gezinme, tek sütun kartlar, kaydırılabilir oyuncu tablosu ve üstte sabit gezinme uygulandı.
- Klavye odakları, içeriğe geç bağlantısı, aktif sayfa bildirimi, azaltılmış hareket ve yazdırma görünümü düzenlendi.
- Strateji karşılaştırmasının açıklamasındaki eski otomatik rakip kontrol metni mevcut ayar davranışıyla eşitlendi.
- 31 mevcut otomatik test ve beş gerçek tarayıcı testi geçti. Sekiz ekran 390 px mobil genişlikte yatay sayfa taşması açısından kontrol edildi; 1440 px masaüstü görünümü incelendi.

## Yayın dosyalarının sadeleştirilmesi — 2026-10-31

- Gereksiz `Tiles_Survive_RR_Strategy_Commander.html` kopyası kaldırıldı; tek giriş dosyası `index.html` oldu.
- Testler ve kullanım notları tek giriş dosyasına göre güncellendi.

## Oyuncu verilerinin gizliliği — 2026-10-31

- Gerçek oyuncu adı/gücü içeren başlangıç JavaScript'i ve Excel test dosyası kaldırıldı.
- İlk açılış boş kadroya geçirildi; mevcut tarayıcı kayıtları ve JSON taşıma korundu.
- Gerçek örnek kadro yükleme kaldırıldı; yerel kadroyu temizleme artık boş duruma döner.
- Testler yalnızca bağımsız üretilmiş yapay JSON/XLSX verisi kullanır.
- Özel çalışma kitapları ve standart yerel dışa aktarımlar `.gitignore` kapsamına alındı.
- Önceki veriler GitHub'daki eski committe bulundu; uzak geçmiş ayrıca temizlenmeden bu dosyaların geçmişten silindiği iddia edilmez.
- Boş başlangıç ve yerel veri akışını içeren 35 otomatik test ile altı tarayıcı testi geçti.

## Temiz Git geçmişi

- Kullanıcı onayıyla `dev` dalı, oyuncu verisi içeren geliştirme commitini kapsamayan temiz bir geçmişe geçirildi.
- Temiz sürüm başlangıçtaki yalnızca lisans içeren committen türetildi; `main` korunur.
- Yayında yalnızca `dev` ref'i ve beklenen eski uç için `--force-with-lease` kullanılır.
- Eski harici klonlar, forklar ve GitHub önbelleklerinin dal güncellemesiyle silinmediği belgelendi.
