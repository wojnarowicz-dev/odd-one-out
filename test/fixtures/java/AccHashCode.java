package fixture.accessors;

// Exercises the accessor filter for `hashCode` paired with `compareTo`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccHashCode {

    private Probe13 probe;

    public void holds1() {
        probe.hashCode();
        probe.compareTo();
    }

    public void holds2() {
        probe.hashCode();
        probe.compareTo();
    }

    public void holds3() {
        probe.hashCode();
        probe.compareTo();
    }

    public void holds4() {
        probe.hashCode();
        probe.compareTo();
    }

    public void deviates() {
        probe.hashCode();
    }
}
