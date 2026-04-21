import pytest
from app.models.pokemon import SeasonPokemon


def create_season_pokemon(db_session, season, species_list, tier="A", cost=10, legal=True):
    """Helper to seed season pokemon."""
    for sp_obj in species_list:
        sp = SeasonPokemon(
            season_id=season.id,
            species_id=sp_obj.id,
            tier=tier,
            point_cost=cost,
            is_legal=legal,
        )
        db_session.add(sp)
    db_session.commit()


def test_admin_can_set_tier_and_cost(test_client, admin_headers, test_season, test_pokemon_species):
    species = test_pokemon_species[0]
    response = test_client.post(
        f"/seasons/{test_season.id}/pokemon/bulk-update",
        json={"updates": [{"species_id": species.id, "tier": "S", "point_cost": 20}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["updated"] == 1


def test_bulk_update_saves_all_changes_not_just_last(
    test_client, admin_headers, test_season, test_pokemon_species
):
    """Critical: ensure all 6 updates are saved, not just the last."""
    updates = [
        {"species_id": sp.id, "tier": "S", "point_cost": 20 - i}
        for i, sp in enumerate(test_pokemon_species)
    ]
    response = test_client.post(
        f"/seasons/{test_season.id}/pokemon/bulk-update",
        json={"updates": updates},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 6

    # Verify all are saved
    list_resp = test_client.get(f"/seasons/{test_season.id}/pokemon")
    pokemon_list = list_resp.json()
    assert len(pokemon_list) == 6
    tiers = {p["tier"] for p in pokemon_list}
    assert "S" in tiers


def test_tier_update_blocked_after_lock(
    test_client, admin_headers, test_season, test_pokemon_species, db_session
):
    # Add season pokemon with tiers first, then lock
    create_season_pokemon(db_session, test_season, test_pokemon_species)
    test_client.post(f"/seasons/{test_season.id}/lock-tiers", headers=admin_headers)

    response = test_client.post(
        f"/seasons/{test_season.id}/pokemon/bulk-update",
        json={"updates": [{"species_id": test_pokemon_species[0].id, "tier": "D"}]},
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_lock_tiers_changes_season_status(
    test_client, admin_headers, test_season, test_pokemon_species, db_session
):
    create_season_pokemon(db_session, test_season, test_pokemon_species)
    response = test_client.post(f"/seasons/{test_season.id}/lock-tiers", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["season_status"] == "draft"


def test_lock_tiers_with_missing_assignments_returns_400(
    test_client, admin_headers, test_season, test_pokemon_species, db_session
):
    # Add pokemon WITHOUT tier (tier=None, is_legal=True)
    for sp_obj in test_pokemon_species:
        sp = SeasonPokemon(
            season_id=test_season.id,
            species_id=sp_obj.id,
            tier=None,
            point_cost=10,
            is_legal=True,
        )
        db_session.add(sp)
    db_session.commit()

    response = test_client.post(f"/seasons/{test_season.id}/lock-tiers", headers=admin_headers)
    assert response.status_code == 400


def test_illegal_pokemon_excluded_from_draft_pool(
    test_client, admin_headers, test_season, test_pokemon_species, db_session
):
    # Mark first pokemon as illegal
    for i, sp_obj in enumerate(test_pokemon_species):
        sp = SeasonPokemon(
            season_id=test_season.id,
            species_id=sp_obj.id,
            tier="A",
            point_cost=10,
            is_legal=(i > 0),  # first one is illegal
        )
        db_session.add(sp)
    db_session.commit()

    list_resp = test_client.get(f"/seasons/{test_season.id}/pokemon")
    pokemon_list = list_resp.json()
    illegal = [p for p in pokemon_list if not p["is_legal"]]
    assert len(illegal) == 1


def test_locked_tiers_still_readable(
    test_client, admin_headers, test_season, test_pokemon_species, db_session
):
    create_season_pokemon(db_session, test_season, test_pokemon_species)
    test_client.post(f"/seasons/{test_season.id}/lock-tiers", headers=admin_headers)

    response = test_client.get(f"/seasons/{test_season.id}/pokemon")
    assert response.status_code == 200
    assert len(response.json()) == 6
