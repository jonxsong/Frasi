from httpx import AsyncClient


async def test_register_login_refresh_and_revoke(client: AsyncClient) -> None:
    registration = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "musician@example.com",
            "password": "correct-horse-battery-staple",
            "display_name": "Test Musician",
        },
    )
    assert registration.status_code == 201
    registered = registration.json()
    assert registered["user"]["email"] == "musician@example.com"

    duplicate = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "musician@example.com",
            "password": "correct-horse-battery-staple",
            "display_name": "Duplicate",
        },
    )
    assert duplicate.status_code == 409

    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {registered['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["display_name"] == "Test Musician"

    rotated = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != registered["refresh_token"]

    replay = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": registered["refresh_token"]},
    )
    assert replay.status_code == 401


async def test_rejects_invalid_credentials(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "not-the-password"},
    )
    assert response.status_code == 401
