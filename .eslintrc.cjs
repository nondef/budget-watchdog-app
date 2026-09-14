module.exports = {
    root: true,
    env: {
        node: true
    },
    'extends': [
        'plugin:vue/vue3-essential',
        'eslint:recommended',
        '@vue/typescript/recommended'
    ],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    rules: {
        // Ionic bileşenleri web-component slot'ları kullanır; Vue 2 slot söz dizimi değildir.
        'vue/no-deprecated-slot-attribute': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_'
        }],
        // 'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
        // 'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
        // '@typescript-eslint/no-explicit-any': 'off',
    },
    overrides: [
        {
            files: ['tests/**/*.ts'],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off'
            }
        },
        {
            // SQL adapter/repository katmanı şemasız sürücü satırlarıyla
            // çalışır; `any` burada kontrollü bir serileştirme sınırıdır.
            files: [
                'src/domain/interfaces/database-adapter.ts',
                'src/domain/interfaces/repository.interface.ts',
                'src/infrastructure/adapters/**/*.ts',
                'src/infrastructure/database/**/*.ts'
            ],
            rules: {
                '@typescript-eslint/no-explicit-any': 'off'
            }
        }
    ]
}
