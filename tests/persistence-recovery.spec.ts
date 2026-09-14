import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import {
    classifyPersistenceError,
    EncryptionKeyLostError,
    isRetryableFailure,
    looksLikeWrongEncryptionKey,
    MigrationFailedError,
} from '@/infrastructure/database/errors';
import {
    clearPersistenceFailure,
    markPersistenceFailureFatal,
    persistenceFailure,
    reportPersistenceFailure,
    requiresRecovery,
} from '@/infrastructure/database/persistence-status';
import { guardSubmit } from '@/composables/ui/guard-submit';

describe('Açılış hatası sınıflandırması', () => {
    it('anahtar kaybını ve migration hatasını KALICI sayar', () => {
        expect(classifyPersistenceError(new EncryptionKeyLostError())).toBe('encryption-key-lost');
        expect(classifyPersistenceError(new MigrationFailedError(7, 'x'))).toBe('migration');

        expect(isRetryableFailure('encryption-key-lost')).toBe(false);
        expect(isRetryableFailure('migration')).toBe(false);
    });

    it('tanımadığı hatayı geçici sayar — soğuk açılışta ilk sorgular patlayabiliyor', () => {
        expect(classifyPersistenceError(new Error('database is locked'))).toBe('unknown');
        expect(isRetryableFailure('unknown')).toBe(true);
    });

    it('SQLCipher yanlış anahtar mesajlarını anahtar kaybı olarak tanır', () => {
        // Plugin bu metinleri kendi mesajına sarıyor; tam eşleşme aranamaz.
        expect(looksLikeWrongEncryptionKey(new Error('Open: file is not a database'))).toBe(true);
        expect(looksLikeWrongEncryptionKey(new Error('No Passphrase stored'))).toBe(true);
        expect(classifyPersistenceError(new Error('open failed: file is not a database')))
            .toBe('encryption-key-lost');

        expect(looksLikeWrongEncryptionKey(new Error('NOT NULL constraint failed'))).toBe(false);
    });

    it('migration hatası asıl sebebi MESAJINDA taşır', () => {
        // `cause` zinciri loglara serileştirilmiyor; sebep mesajda olmazsa
        // kurtarma ekranı da tanılama dosyası da "failed" demekle kalırdı.
        const error = new MigrationFailedError(20, 'add_currency_minor_units', new Error('duplicate column name: minor_unit'));

        expect(error.message).toContain('20');
        expect(error.message).toContain('add_currency_minor_units');
        expect(error.message).toContain('duplicate column name: minor_unit');
    });
});

describe('Kurtarma durumu', () => {
    beforeEach(() => clearPersistenceFailure());

    it('geçici hatada kurtarma ekranına GEÇMEZ, denemeler tükenince geçer', () => {
        reportPersistenceFailure(new Error('database is locked'));

        expect(persistenceFailure.value?.kind).toBe('unknown');
        expect(requiresRecovery.value).toBe(false);

        markPersistenceFailureFatal();

        expect(requiresRecovery.value).toBe(true);
    });

    it('kalıcı hatada doğrudan kurtarma ekranına geçer', () => {
        reportPersistenceFailure(new EncryptionKeyLostError());

        expect(requiresRecovery.value).toBe(true);
    });

    it('migration hatasında takılan sürümü taşır', () => {
        reportPersistenceFailure(new MigrationFailedError(29, 'create_saving_goal_contributions_table'));

        expect(persistenceFailure.value?.migration).toEqual({
            version: 29,
            name: 'create_saving_goal_contributions_table',
        });
    });

    it('başarılı kurulum durumu temizler', () => {
        reportPersistenceFailure(new EncryptionKeyLostError());
        clearPersistenceFailure();

        expect(persistenceFailure.value).toBeNull();
        expect(requiresRecovery.value).toBe(false);
    });
});

describe('Kurtarma yedeği', () => {
    it('okunamayan tabloyu yalnızca tolerans AÇIKKEN atlar', async () => {
        const { SqlJsTestAdapter } = await import('./helpers/sqljs-adapter');
        const { BackupService } = await import('@/infrastructure/services/backup.service');

        // Hiç tablosu olmayan bir veritabanı: patlamış bir migration sonrası
        // şemanın eksik kalmasının en uç hali.
        const db = await SqlJsTestAdapter.create();
        const service = new BackupService();

        // Normal yolda sessizce boş yedek üretmek veri kaybını gizlerdi.
        await expect(service.export({ db })).rejects.toThrow();

        const backup = await service.export({ db, tolerateMissingTables: true });

        expect(backup.meta.skippedTables).toContain('transactions');
        expect(backup.meta.rowCounts.transactions).toBe(0);
    });
});

describe('guardSubmit', () => {
    it('gönderim sürerken ikinci çağrıyı yutar', () => {
        const isSubmitting = ref(false);
        const submit = vi.fn(() => { isSubmitting.value = true; });
        const guarded = guardSubmit(isSubmitting, submit);

        guarded();
        guarded();

        expect(submit).toHaveBeenCalledTimes(1);
    });

    it('gönderim bitince yeniden çalışır ve argümanları geçirir', () => {
        const isSubmitting = ref(false);
        const submit = vi.fn((_event: string) => 'ok');
        const guarded = guardSubmit(isSubmitting, submit);

        expect(guarded('click')).toBe('ok');
        expect(guarded('click')).toBe('ok');
        expect(submit).toHaveBeenNthCalledWith(2, 'click');
    });
});
