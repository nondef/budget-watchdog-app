import type { Ref } from 'vue';

/**
 * Aynı formun iki kez gönderilmesini engeller.
 *
 * `:disabled` bağlaması tek başına yetmiyor. `isSubmitting` senkron olarak
 * true'ya çekiliyor ama butonun gerçekten tıklanamaz hale gelmesi bir sonraki
 * render'a kalıyor — `ion-button` gibi Stencil bileşenlerinde bu, kendi
 * zamanlayıcısına bağlı ekstra bir gecikme demek. Kullanıcının çift dokunduğu
 * an tam olarak cihazın yavaş olduğu andır, yani pencerenin en geniş olduğu an.
 *
 * Bedeli bir finans uygulamasında somut: iki kez kaydedilen bir harcama hesabı
 * iki kez düşürür, bütçeyi iki kez doldurur, hatta aşım bildirimi tetikler —
 * ve hiçbir hata göstermez. Kullanıcı yalnızca tutmayan bir bakiye görür,
 * mükerrer kaydı kendisi bulup silmek zorunda kalır.
 *
 * `handleSubmit`'in kendisinde yeniden giriş koruması YOK (vee-validate 4.15:
 * `submissionHandler` her çağrıldığında baştan çalışır), bu yüzden koruma
 * çağrı sarmalayıcısında.
 *
 * @param isSubmitting `useForm()` dönüşündeki bayrak — tıklama anında senkron
 *   olarak true olur, gönderim bitince (hata dahil) false'a döner.
 * @param submit `handleSubmit(...)` ile üretilmiş gönderici.
 */
export function guardSubmit<T extends unknown[]>(
    isSubmitting: Readonly<Ref<boolean>>,
    submit: (...args: T) => unknown,
): (...args: T) => unknown {
    return (...args: T) => {
        if (isSubmitting.value) return;

        return submit(...args);
    };
}
