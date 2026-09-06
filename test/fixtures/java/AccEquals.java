package fixture.accessors;

// Exercises the accessor filter for `equals` paired with `hashCode`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccEquals {

    private Probe12 probe;

    public void holds1() {
        probe.equals();
        probe.hashCode();
    }

    public void holds2() {
        probe.equals();
        probe.hashCode();
    }

    public void holds3() {
        probe.equals();
        probe.hashCode();
    }

    public void holds4() {
        probe.equals();
        probe.hashCode();
    }

    public void deviates() {
        probe.equals();
    }
}
