# Tiles Survive — RR Strategy Commander

R4 subayları için kadro, takım, faz görevleri ve su puanı planlayıcısı. Oyunla otomatik veri bağlantısı kurmaz.

## Kullanım

1. `index.html` dosyasını `assets/` klasörü yanında tutarak modern Chrome veya Edge ile açın; GitHub Pages yayınına aynı dosyaları birlikte koyun. Derleme, npm, CDN veya backend gerekmez.
2. Uygulama ilk açılışta boş kadroyla başlar. Oyuncu Kadrosu ekranından kendi XLSX/CSV/TSV/JSON dosyanızı seçin, önizlemeyi inceleyip onaylayın. Varsayılan sınırlar 30 asil ve 10 yedektir; ek havuz oyuncuları desteklenir.
3. Takım veya rolü manuel değiştirince ilgili kilit etkinleşir. Hedef değişiklikleri de kilitlenir. Yeniden planlama kilitleri korur; olanaksız bir konfigürasyon mevcut planı değiştirmez.
4. Ayarlar'da zamanları, üretim/FTC değerlerini, öncelikleri, rakip Power varsayımlarını ve strateji ağırlıklarını düzenleyin. Atanmayan bina varsayılan olarak boş/bilinmiyor kabul edilir.
5. Beş stratejinin dağılımını ve fırsat maliyetini karşılaştırın. Takım kartlarında gerekçe, Holder devri, takviye ve geri çekilme yönergelerini açın.
6. Su Hesaplayıcı'da `1:biz; 18:rakip; 27:biz` gibi kontrol olayları girin. Kesirli dakikalar desteklenir. Tank çizelgesi `22:biz:3; 35:rakip:2` biçimindedir; doluysa toplam tank adetlerinin yerini alır.
7. Battle Control'de gerçek skor ve bina sahipliğini elle girin; mevcut kontrolün sürmesi ve Central seçeneğinin koşullu projeksiyonlarını inceleyin.

Rol/takım değişiklikleri geçici bir taslak oluşturabilir; eksikler uyarılarda görünür. Geçersiz planın emir çıktısı engellenir. Yedek değişimi, asil oyuncunun görev ve kilitlerini tek işlemde devreder. Tüm kilitleri kaldırmak için açık sıfırlama düğmesi vardır.

## Kayıt ve yayın

Tam JSON yedeği ayarları, oyuncuları, kilitleri, simülasyonu ve manuel saha verilerini korur. v1 yedekleri v2'ye taşınır. Bozuk içe aktarma mevcut kaydı değiştirmez. Mevcut kilitler yüklemede de korunur; bilerek değiştirmek istiyorsanız önce kaldırın.

Tarayıcı kaydı `rr-strategy-commander-v1` anahtarını kullanmaya devam eder. Yerel dosyadan GitHub Pages'e geçişte köken değişeceği için JSON dışa/içe aktarma kullanın.

`index.html` tek yayın girişidir. Yayın paketine `index.html`, `.nojekyll` ve `assets/` dahildir. Yerel dosyalarla çevrimdışı kullanım mümkündür; barındırılan URL'nin çevrimdışı yeniden açılmasını sağlayan service worker yoktur.

## Testler

```sh
node --test tests/app.test.cjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Tarayıcı testleri için yerel sunucuda `/tests/browser-tests.html` açın ve **Testleri çalıştır** düğmesine basın. Yalnızca tamamen yapay ad ve güçlerle üretilmiş `tests/fixtures/synthetic-roster.xlsx` test dosyası depoda bulunur; gerçek oyuncu dosyası kullanılmaz. Test için npm kurulumu gerekmez.

## Kod düzeni

`assets/js/`: `config` → `validation` → `state` → `planner` → `ui` → `simulation` → `ui-settings` → `io` → `battle` → `app`. Başlangıç kadrosu gömülmez. HTML'de sıralı klasik `defer` scriptleri kullanılır. CSS gömülüdür. JSON sürümü, doğrulama ve geçiş işlemleri `validation.js` içinde; olay bağlama ve başlatma `app.js` içindedir.

[Denetim, kaynak doğrulaması, algoritma ve test kanıtı](docs/AUDIT.md). Hesaplanan su, girilen kontrol varsayımlarının sonucudur; stratejik puanlar ve Power kazanma olasılığı değildir. Harita şematiktir; seyahat süreleri ve otomatik garnizon devri varsayılmaz.

## Oyuncu verilerinin gizliliği

Uygulama bir hesap/giriş sistemi gerektirmez. Seçtiğiniz dosya tarayıcının yerel dosya API'leriyle okunur, sunucuya yüklenmez. Kaydetme `localStorage`, taşıma ise indirilen JSON yedeği üzerinden yapılır. Farklı cihazlar arasında otomatik eşitleme yoktur; aynı tarayıcı kökeninde daha önce kaydedilmiş kadro açılışta geri yüklenir. Yerel kayıt, o tarayıcı profiline erişebilen kişiler tarafından görülebilir.

Gerçek kadroları ve dışa aktarılan planları depo dışında tutun. `.gitignore`, çalışma kitaplarını, CSV/TSV dosyalarını, yerel yedek klasörlerini ve uygulamanın standart strateji JSON dosyalarını dışlar; yalnızca adlandırılmış yapay Excel fixture'ına izin verir. JSON dışa aktarma kendi bilgisayarınıza dosya indirir; bu dosyayı repoya koymayın.

**Git geçmişi:** Oyuncu verisi içeren geliştirme commiti yerine, temiz başlangıç commitinden türetilmiş yeni bir `dev` geçmişi kullanılır. Gerçek veriler bu dalın yeni geçmişine dahil edilmez. Eski klonlar, forklar ve GitHub önbelleğindeki eski commit görünümleri otomatik silinmez; eski geçmişi yeniden birleştirerek verileri geri getirmeyin. Önbellek ve diğer kopyalar için [GitHub’ın geçmiş temizleme açıklamasına](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) bakın.
