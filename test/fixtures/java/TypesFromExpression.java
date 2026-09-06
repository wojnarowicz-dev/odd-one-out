package fixture.types;

// Type resolution, source 3: the project-wide expression -> type map.
// This declaration teaches the whole project that `registry.lookup()` yields
// a Gamma, so calls made directly on that expression are qualified as Gamma
// rather than dropped into `?`.
public class TypesFromExpression {

    private Registry registry;

    public void learnsTheType() {
        Gamma learned = registry.lookup();
        learned.begin();
        learned.commit();
    }

    public void usesTheExpression1() {
        registry.lookup().begin();
        registry.lookup().commit();
    }

    public void usesTheExpression2() {
        registry.lookup().begin();
        registry.lookup().commit();
    }

    public void forgetsToCommit() {
        registry.lookup().begin();
    }
}
