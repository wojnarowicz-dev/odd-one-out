package fixture.accessors;

// Exercises the accessor filter for `getWidth` paired with `isEmpty`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class PreGetWidth {

    private Shape0 probe;

    public void holds1() {
        probe.getWidth();
        probe.isEmpty();
    }

    public void holds2() {
        probe.getWidth();
        probe.isEmpty();
    }

    public void holds3() {
        probe.getWidth();
        probe.isEmpty();
    }

    public void holds4() {
        probe.getWidth();
        probe.isEmpty();
    }

    public void deviates() {
        probe.getWidth();
    }
}
