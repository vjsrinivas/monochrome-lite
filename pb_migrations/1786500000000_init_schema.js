// init: create the DB_users auth collection and the themes collection.
// Translated from scripts/pocketbase-schema.json into PocketBase's native
// import format. The docker pocketbase image auto-applies anything under
// pb_migrations on startup.
// ponytail: importCollections(snapshot, false) merges, so this is a no-op for
// collections that already exist. "down" intentionally does nothing: running it
// would delete live user data.

/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const snapshot = [
        {
            "id": "pbc_db_users",
            "name": "DB_users",
            "type": "auth",
            "fields": [
                {
                    "id": "pbcid",
                    "name": "id",
                    "type": "text",
                    "system": true,
                    "required": true,
                    "presentable": false,
                    "unique": true,
                    "primaryKey": true,
                    "autogeneratePattern": "[a-z0-9]{15}",
                    "options": { "min": 15, "max": 15, "pattern": "^[a-z0-9]+$" }
                },
                {
                    "id": "field_username",
                    "name": "username",
                    "type": "text",
                    "system": false,
                    "required": true,
                    "presentable": false,
                    "unique": true,
                    "options": { "min": null, "max": null, "pattern": "^[a-zA-Z0-9_-]{2,32}$" }
                },
                {
                    "id": "field_display_name",
                    "name": "display_name",
                    "type": "text",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 64, "pattern": "" }
                },
                {
                    "id": "field_avatar_url",
                    "name": "avatar_url",
                    "type": "url",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": null, "exceptDomains": null, "onlyDomains": null }
                },
                {
                    "id": "field_banner",
                    "name": "banner",
                    "type": "url",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": null, "exceptDomains": null, "onlyDomains": null }
                },
                {
                    "id": "field_status",
                    "name": "status",
                    "type": "text",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 512, "pattern": "" }
                },
                {
                    "id": "field_about",
                    "name": "about",
                    "type": "text",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 2048, "pattern": "" }
                },
                {
                    "id": "field_website",
                    "name": "website",
                    "type": "url",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": null, "exceptDomains": null, "onlyDomains": null }
                },
                {
                    "id": "field_email",
                    "name": "email",
                    "type": "email",
                    "system": true,
                    "required": true,
                    "presentable": false,
                    "unique": true,
                    "options": { "exceptDomains": null, "onlyDomains": null }
                },
                {
                    "id": "field_password",
                    "name": "password",
                    "type": "password",
                    "system": true,
                    "required": true,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": 6, "max": 72, "pattern": "" }
                },
                {
                    "id": "field_privacy",
                    "name": "privacy",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "field_library",
                    "name": "library",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "field_history",
                    "name": "history",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "field_user_playlists",
                    "name": "user_playlists",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "field_user_folders",
                    "name": "user_folders",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "field_favorite_albums",
                    "name": "favorite_albums",
                    "type": "json",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "maxSize": 0 }
                },
                {
                    "id": "pbccreated",
                    "name": "created", "onCreate": true, "onUpdate": false,
                    "type": "autodate",
                    "system": true,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": "", "max": "" }
                },
                {
                    "id": "pbcupdated",
                    "name": "updated", "onCreate": true, "onUpdate": true,
                    "type": "autodate",
                    "system": true,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": "", "max": "" }
                }
            ],
            "listRule": "",
            "viewRule": "",
            "createRule": "",
            "updateRule": "",
            "deleteRule": "",
            "indexes": []
        },
        {
            "id": "pbc_themes",
            "name": "themes",
            "type": "base",
            "fields": [
                {
                    "id": "field_name",
                    "name": "name",
                    "type": "text",
                    "system": false,
                    "required": true,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 256, "pattern": "" }
                },
                {
                    "id": "field_description",
                    "name": "description",
                    "type": "text",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 4096, "pattern": "" }
                },
                {
                    "id": "field_css",
                    "name": "css",
                    "type": "text",
                    "system": false,
                    "required": true,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 65536, "pattern": "" }
                },
                {
                    "id": "field_author_name",
                    "name": "authorName",
                    "type": "text",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": 256, "pattern": "" }
                },
                {
                    "id": "field_author_url",
                    "name": "authorUrl",
                    "type": "url",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": null, "max": null, "exceptDomains": null, "onlyDomains": null }
                },
                {
                    "id": "field_author",
                    "name": "author",
                    "type": "relation",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "collectionId": "pbc_db_users", "cascadeDelete": true, "minSelect": null, "maxSelect": 1
                },
                {
                    "id": "field_installs",
                    "name": "installs",
                    "type": "number",
                    "system": false,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": 0, "max": null }
                },
                {
                    "id": "pbccreated",
                    "name": "created", "onCreate": true, "onUpdate": false,
                    "type": "autodate",
                    "system": true,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": "", "max": "" }
                },
                {
                    "id": "pbcupdated",
                    "name": "updated", "onCreate": true, "onUpdate": true,
                    "type": "autodate",
                    "system": true,
                    "required": false,
                    "presentable": false,
                    "unique": false,
                    "options": { "min": "", "max": "" }
                }
            ],
            "listRule": "",
            "viewRule": "",
            "createRule": "",
            "updateRule": "id = @request.auth.id",
            "deleteRule": "id = @request.auth.id",
            "indexes": []
        }
    ];

    return app.importCollections(snapshot, false);
}, (app) => {
    return null;
});