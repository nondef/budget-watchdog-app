import { IUnitOfWork } from "@/domain";
import { RepositoryClass, repositoryManager } from "./repository-manager";

/**
 * Repository/UnitOfWork çözümleyicileri.
 *
 * Vue reaktivitesi ya da lifecycle içermezler; yalnızca `repositoryManager`
 * üzerinden örnek verirler. Bu yüzden `use*` adıyla composable gibi değil,
 * düz DI yardımcıları olarak burada dururlar — tüketicileri de zaten
 * yalnızca Pinia store'ları.
 *
 * İkisi de **tembel** vekil döndürür: `repositoryManager`'a store kurulurken
 * değil, dönen nesnenin bir üyesine ilk kez erişildiğinde bağlanılır.
 *
 * Neden tembel: store'lar bu çözümleyicileri `defineStore` setup gövdesinde
 * çağırıyor (bkz. stores/accounts.ts, stores/budgets.ts, ...). Eager
 * çözümlemede, boot sırasında DB açılamazsa `useAppStore()`/`useBudgetStore()`
 * çağrısının KENDİSİ "RepositoryManager not initialized" ile senkron patlıyordu:
 *
 *  - `App.vue` setup'ı patlıyor → bileşen hiç render edilmiyor → `#app` boş
 *    kalıyor; main.ts mount'u yapsa bile ekran beyaz.
 *  - Router guard'ı `useAppStore()` satırında, yani `initializeWithRetry`'nin
 *    try/catch'inin DIŞINDA patlıyor → guards.ts'teki yeniden deneme
 *    mekanizması hiç çalışma fırsatı bulamıyor.
 *
 * Tembel çözümlemede store kurulumu DB olmadan da başarılı olur; hata ancak
 * gerçekten veriye dokunulduğunda (use-case çalışırken) çıkar ve oradaki
 * try/catch'ler onu yakalayabilir.
 */

/**
 * `resolve`'u her erişimde yeniden çağıran vekil.
 *
 * Örnek bilinçli olarak vekilde ÖNBELLEĞE ALINMAZ: `repositoryManager` zaten
 * sınıf başına tekil tutuyor, dolayısıyla ikinci arama yalnızca bir Map
 * okuması. Önbelleğe alsaydık `repositoryManager.clear()` sonrası vekil, eski
 * adapter'a bağlı ölü repository'yi servis etmeye devam ederdi.
 */
function lazyRef<T extends object>(resolve: () => T): T {
    return new Proxy({} as T, {
        get(_target, prop) {
            const instance = resolve() as Record<PropertyKey, unknown>;
            const value = instance[prop];

            // Metotlar gerçek örneğe bağlanır. Bağlamasaydık `this` vekil olur;
            // metot içindeki her alan okuması yeniden `resolve()` çağırır ve
            // sınıfa bir gün `#private` alan eklendiğinde sessizce patlardı.
            return typeof value === 'function' ? value.bind(instance) : value;
        },
        set(_target, prop, value) {
            (resolve() as Record<PropertyKey, unknown>)[prop] = value;
            return true;
        },
        has(_target, prop) {
            return prop in resolve();
        },
        getPrototypeOf() {
            return Reflect.getPrototypeOf(resolve());
        },
        ownKeys() {
            return Reflect.ownKeys(resolve());
        },
        getOwnPropertyDescriptor(_target, prop) {
            const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), prop);

            // Vekilin hedefi boş bir nesne: raporlanan tanım `configurable`
            // değilse Proxy değişmezi ihlal edilir ve TypeError fırlar.
            return descriptor && { ...descriptor, configurable: true };
        },
    });
}

export function resolveRepository<T extends object>(repositoryClass: RepositoryClass<T>): T {
    return lazyRef(() => repositoryManager.getRepository(repositoryClass));
}

/**
 * Repository'lerle aynı bağlantıyı paylaşan Unit of Work'ü verir.
 * Birden fazla aggregate'e yazan use-case'lere enjekte edilir.
 */
export function resolveUnitOfWork(): IUnitOfWork {
    return lazyRef<IUnitOfWork>(() => repositoryManager.getUnitOfWork());
}
