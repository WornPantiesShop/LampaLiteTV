# Lampa Lite TV 1.1 — Android TV

Это отдельная экспериментальная Android TV WebView-оболочка для Lampa. Она не заменяет оригинальную `top.rootu.lampa` и не меняет системные настройки телевизора.

## Изменения в 1.1

- `LAUNCHER` и `LEANBACK_LAUNCHER` для запуска с Android TV или через ADB.
- Аппаратное ускорение, JavaScript и DOM Storage.
- Нет Crosswalk, принудительных графических слоёв и циклических таймеров кадров.
- Приостановка WebView при уходе приложения в фон.
- Обработка аварийного завершения рендерера и предложение перезапустить страницу.
- Поддержка полноэкранного HTML5-видео и выхода кнопкой Back.
- Передача `magnet:` и `acestream:` внешним приложениям, если они установлены.
- Длительное MENU — логирование нажатий пульта (не счётчик FPS).
- `applicationId=com.example.lampalitetv`, `versionCode=2`, `versionName=1.1-test`.

## Ограничения

Ускорение FPS не гарантировано. HTTP-адрес `http://lampa.mx` не защищён TLS; не вводите пароли и платёжные данные. Это минимальная оболочка, а не полная замена оригинальной Lampa. Совместимость с плеерами и расширениями необходимо проверять.

## Сборка на Windows

1. Клонируйте репозиторий и откройте корень проекта в Android Studio.
2. Настройте **Gradle JDK 17**.
3. Дождитесь синхронизации Gradle. Если Gradle Wrapper JAR отсутствует, Android Studio может использовать установленный Gradle; также можно создать wrapper локально с помощью установленного Gradle.
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. Результат: `app/build/outputs/apk/debug/app-debug.apk`.

## Установка (по решению пользователя)

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$tv = "192.168.31.18:5555"
$apk = ".\app\build\outputs\apk\debug\app-debug.apk"
& $adb -s $tv install -r $apk
& $adb -s $tv shell am start -n com.example.lampalitetv/.MainActivity
```

При ошибке `INSTALL_FAILED_UPDATE_INCOMPATIBLE` не удаляйте старую версию без резервной копии — могла отличаться подпись APK.

## Обновления

В папке клонированного проекта:

```powershell
git pull origin main
```

Существующую распакованную папку не нужно перезаписывать поверх клона.
